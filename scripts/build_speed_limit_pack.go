package main

import (
	"context"
	"crypto/md5"
	"database/sql"
	"encoding/json"
	"encoding/xml"
	"errors"
	"flag"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"

	"github.com/qedus/osmpbf"
	_ "modernc.org/sqlite"
)

const cellSizeDegrees = 0.002

var drivableHighways = map[string]struct{}{
	"motorway":       {},
	"trunk":          {},
	"primary":        {},
	"secondary":      {},
	"tertiary":       {},
	"unclassified":   {},
	"residential":    {},
	"living_street":  {},
	"service":        {},
	"motorway_link":  {},
	"trunk_link":     {},
	"primary_link":   {},
	"secondary_link": {},
	"tertiary_link":  {},
}

var defaultSourceSpeeds = map[string]float64{
	"IE:urban":          50.0,
	"IE:rural":          80.0,
	"IE:national":       100.0,
	"IE:motorway":       120.0,
	"GB:20 mph":         32.2,
	"GB:30 mph":         48.3,
	"GB:40 mph":         64.4,
	"GB:50 mph":         80.5,
	"GB:60 mph":         96.6,
	"GB:70 mph":         112.7,
	"GB:nsl_single":     96.6,
	"GB:nsl_dual":       112.7,
	"GB:nsl_restricted": 48.3,
	"GB:motorway":       112.7,
}

type coordinate struct {
	Lat float64
	Lon float64
}

type bounds struct {
	MinLat float64 `json:"minLat"`
	MinLon float64 `json:"minLon"`
	MaxLat float64 `json:"maxLat"`
	MaxLon float64 `json:"maxLon"`
}

type resolvedSpeedLimit struct {
	SpeedLimitKMH float64
	RawSpeedTag   *string
}

type buildResult struct {
	Bounds bounds
}

type cliArgs struct {
	Input           string
	InputURL        string
	OutputDB        string
	OutputManifest  string
	DownloadURL     string
	RegionID        string
	RegionName      string
	PackVersion     string
	SourceTimestamp string
}

type manifest struct {
	SchemaVersion   int    `json:"schemaVersion"`
	GeneratedAt     string `json:"generatedAt"`
	RegionID        string `json:"regionId"`
	RegionName      string `json:"regionName"`
	PackVersion     string `json:"packVersion"`
	SourceTimestamp string `json:"sourceTimestamp"`
	DownloadURL     string `json:"downloadUrl"`
	MD5             string `json:"md5"`
	SizeBytes       int64  `json:"sizeBytes"`
	Bounds          bounds `json:"bounds"`
	OSMAttribution  string `json:"osmAttribution"`
}

type buildOutput struct {
	OutputDB       string `json:"outputDb"`
	OutputManifest string `json:"outputManifest"`
}

type xmlNode struct {
	ID  int64   `xml:"id,attr"`
	Lat float64 `xml:"lat,attr"`
	Lon float64 `xml:"lon,attr"`
}

type xmlWayRef struct {
	Ref int64 `xml:"ref,attr"`
}

type xmlTag struct {
	Key   string `xml:"k,attr"`
	Value string `xml:"v,attr"`
}

type xmlWay struct {
	ID   int64       `xml:"id,attr"`
	Refs []xmlWayRef `xml:"nd"`
	Tags []xmlTag    `xml:"tag"`
}

type packWriter struct {
	db                *sql.DB
	tx                *sql.Tx
	insertSegmentStmt *sql.Stmt
	insertCellStmt    *sql.Stmt
	segmentID         int64
	knownBounds       *bounds
}

type nodeStore struct {
	path       string
	db         *sql.DB
	tx         *sql.Tx
	insertStmt *sql.Stmt
	lookupStmt *sql.Stmt
}

func parseMaxspeed(rawValue string) *float64 {
	value := strings.ToLower(strings.TrimSpace(rawValue))
	if value == "" {
		return nil
	}

	firstSegment := strings.TrimSpace(strings.Split(value, ";")[0])
	if firstSegment == "" {
		return nil
	}

	var builder strings.Builder
	decimalSeen := false
	for _, char := range firstSegment {
		switch {
		case char >= '0' && char <= '9':
			builder.WriteRune(char)
		case char == '.' && !decimalSeen:
			builder.WriteRune(char)
			decimalSeen = true
		case builder.Len() > 0:
			goto done
		}
	}

done:
	numeric := builder.String()
	if numeric == "" {
		return nil
	}

	parsed, err := strconv.ParseFloat(numeric, 64)
	if err != nil || parsed <= 0 {
		return nil
	}

	if strings.Contains(firstSegment, "mph") {
		rounded := roundToOneDecimal(parsed * 1.60934)
		return &rounded
	}

	rounded := roundToOneDecimal(parsed)
	return &rounded
}

func resolveSpeedLimit(tags map[string]string) *resolvedSpeedLimit {
	explicit := parseMaxspeed(tags["maxspeed"])
	if explicit != nil {
		return &resolvedSpeedLimit{
			SpeedLimitKMH: *explicit,
			RawSpeedTag:   optionalString(tags["maxspeed"]),
		}
	}

	sourceTag := firstNonEmpty(tags["source:maxspeed"], tags["maxspeed:type"])
	if fallbackSpeed, ok := defaultSourceSpeeds[sourceTag]; ok {
		return &resolvedSpeedLimit{
			SpeedLimitKMH: fallbackSpeed,
		}
	}

	return nil
}

func roundToOneDecimal(value float64) float64 {
	return math.Round(value*10) / 10
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}

	return ""
}

func optionalString(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}

	copy := value
	return &copy
}

func iterSegmentCells(startLat float64, startLon float64, endLat float64, endLon float64) []string {
	minLatIndex := int(math.Floor(math.Min(startLat, endLat) / cellSizeDegrees))
	maxLatIndex := int(math.Floor(math.Max(startLat, endLat) / cellSizeDegrees))
	minLonIndex := int(math.Floor(math.Min(startLon, endLon) / cellSizeDegrees))
	maxLonIndex := int(math.Floor(math.Max(startLon, endLon) / cellSizeDegrees))

	cellCount := (maxLatIndex - minLatIndex + 1) * (maxLonIndex - minLonIndex + 1)
	cells := make([]string, 0, cellCount)

	for latIndex := minLatIndex; latIndex <= maxLatIndex; latIndex++ {
		for lonIndex := minLonIndex; lonIndex <= maxLonIndex; lonIndex++ {
			cells = append(cells, fmt.Sprintf("%d:%d", latIndex, lonIndex))
		}
	}

	return cells
}

func newPackWriter(outputDB string) (*packWriter, error) {
	if err := os.MkdirAll(filepath.Dir(outputDB), 0o755); err != nil {
		return nil, fmt.Errorf("create output directory: %w", err)
	}

	if err := os.Remove(outputDB); err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("remove existing output database: %w", err)
	}

	db, err := sql.Open("sqlite", outputDB)
	if err != nil {
		return nil, fmt.Errorf("open output database: %w", err)
	}

	writer := &packWriter{
		db:        db,
		segmentID: 1,
	}

	if err := writer.setupSchema(); err != nil {
		writer.cleanup()
		return nil, err
	}

	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		writer.cleanup()
		return nil, fmt.Errorf("begin output transaction: %w", err)
	}
	writer.tx = tx

	writer.insertSegmentStmt, err = tx.PrepareContext(context.Background(), `
		INSERT INTO road_segments (
			id,
			way_id,
			speed_limit_kmh,
			raw_speed_tag,
			start_lat,
			start_lon,
			end_lat,
			end_lon
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		writer.cleanup()
		return nil, fmt.Errorf("prepare road segment insert: %w", err)
	}

	writer.insertCellStmt, err = tx.PrepareContext(context.Background(), `INSERT OR IGNORE INTO segment_cells (cell_key, segment_id) VALUES (?, ?)`)
	if err != nil {
		writer.cleanup()
		return nil, fmt.Errorf("prepare segment cell insert: %w", err)
	}

	return writer, nil
}

func (writer *packWriter) setupSchema() error {
	statements := []string{
		`PRAGMA journal_mode = OFF;`,
		`PRAGMA synchronous = OFF;`,
		`
		CREATE TABLE road_segments (
			id INTEGER PRIMARY KEY,
			way_id INTEGER NOT NULL,
			speed_limit_kmh REAL NOT NULL,
			raw_speed_tag TEXT,
			start_lat REAL NOT NULL,
			start_lon REAL NOT NULL,
			end_lat REAL NOT NULL,
			end_lon REAL NOT NULL
		);
		`,
		`
		CREATE TABLE segment_cells (
			cell_key TEXT NOT NULL,
			segment_id INTEGER NOT NULL,
			PRIMARY KEY (cell_key, segment_id)
		);
		`,
		`CREATE INDEX idx_segment_cells_key ON segment_cells(cell_key);`,
	}

	for _, statement := range statements {
		if _, err := writer.db.ExecContext(context.Background(), statement); err != nil {
			return fmt.Errorf("set up output schema: %w", err)
		}
	}

	return nil
}

func (writer *packWriter) prepareWay(tags map[string]string) *resolvedSpeedLimit {
	if _, ok := drivableHighways[tags["highway"]]; !ok {
		return nil
	}

	return resolveSpeedLimit(tags)
}

func (writer *packWriter) updateBounds(coordinates []coordinate) {
	if len(coordinates) == 0 {
		return
	}

	minLat := coordinates[0].Lat
	minLon := coordinates[0].Lon
	maxLat := coordinates[0].Lat
	maxLon := coordinates[0].Lon

	for _, coordinate := range coordinates[1:] {
		minLat = math.Min(minLat, coordinate.Lat)
		minLon = math.Min(minLon, coordinate.Lon)
		maxLat = math.Max(maxLat, coordinate.Lat)
		maxLon = math.Max(maxLon, coordinate.Lon)
	}

	if writer.knownBounds == nil {
		writer.knownBounds = &bounds{
			MinLat: minLat,
			MinLon: minLon,
			MaxLat: maxLat,
			MaxLon: maxLon,
		}
		return
	}

	writer.knownBounds.MinLat = math.Min(writer.knownBounds.MinLat, minLat)
	writer.knownBounds.MinLon = math.Min(writer.knownBounds.MinLon, minLon)
	writer.knownBounds.MaxLat = math.Max(writer.knownBounds.MaxLat, maxLat)
	writer.knownBounds.MaxLon = math.Max(writer.knownBounds.MaxLon, maxLon)
}

func (writer *packWriter) addPreparedWay(wayID int64, resolvedLimit *resolvedSpeedLimit, coordinates []coordinate) error {
	if resolvedLimit == nil {
		return nil
	}

	if len(coordinates) < 2 {
		return nil
	}

	writer.updateBounds(coordinates)

	for index := 0; index < len(coordinates)-1; index++ {
		start := coordinates[index]
		end := coordinates[index+1]

		if start.Lat == end.Lat && start.Lon == end.Lon {
			continue
		}

		segmentID := writer.segmentID
		writer.segmentID++

		if _, err := writer.insertSegmentStmt.ExecContext(
			context.Background(),
			segmentID,
			wayID,
			resolvedLimit.SpeedLimitKMH,
			resolvedLimit.RawSpeedTag,
			start.Lat,
			start.Lon,
			end.Lat,
			end.Lon,
		); err != nil {
			return fmt.Errorf("insert road segment: %w", err)
		}

		for _, cellKey := range iterSegmentCells(start.Lat, start.Lon, end.Lat, end.Lon) {
			if _, err := writer.insertCellStmt.ExecContext(context.Background(), cellKey, segmentID); err != nil {
				return fmt.Errorf("insert segment cell: %w", err)
			}
		}
	}

	return nil
}

func (writer *packWriter) finalize() (buildResult, error) {
	resultBounds := bounds{}
	if writer.knownBounds != nil {
		resultBounds = *writer.knownBounds
	}

	if err := writer.closeStatements(); err != nil {
		return buildResult{}, err
	}

	if err := writer.tx.Commit(); err != nil {
		return buildResult{}, fmt.Errorf("commit output database: %w", err)
	}
	writer.tx = nil

	if err := writer.db.Close(); err != nil {
		return buildResult{}, fmt.Errorf("close output database: %w", err)
	}
	writer.db = nil

	return buildResult{
		Bounds: resultBounds,
	}, nil
}

func (writer *packWriter) closeStatements() error {
	if writer.insertSegmentStmt != nil {
		if err := writer.insertSegmentStmt.Close(); err != nil {
			return fmt.Errorf("close segment insert statement: %w", err)
		}
		writer.insertSegmentStmt = nil
	}

	if writer.insertCellStmt != nil {
		if err := writer.insertCellStmt.Close(); err != nil {
			return fmt.Errorf("close cell insert statement: %w", err)
		}
		writer.insertCellStmt = nil
	}

	return nil
}

func (writer *packWriter) cleanup() {
	_ = writer.closeStatements()

	if writer.tx != nil {
		_ = writer.tx.Rollback()
		writer.tx = nil
	}

	if writer.db != nil {
		_ = writer.db.Close()
		writer.db = nil
	}
}

func newNodeStore() (*nodeStore, error) {
	file, err := os.CreateTemp("", "speed-limit-pack-nodes-*.sqlite")
	if err != nil {
		return nil, fmt.Errorf("create node store: %w", err)
	}

	path := file.Name()
	if err := file.Close(); err != nil {
		_ = os.Remove(path)
		return nil, fmt.Errorf("close node store seed file: %w", err)
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		_ = os.Remove(path)
		return nil, fmt.Errorf("open node store database: %w", err)
	}

	store := &nodeStore{
		path: path,
		db:   db,
	}

	statements := []string{
		`PRAGMA journal_mode = OFF;`,
		`PRAGMA synchronous = OFF;`,
		`PRAGMA temp_store = MEMORY;`,
		`
		CREATE TABLE node_locations (
			id INTEGER PRIMARY KEY,
			lat REAL NOT NULL,
			lon REAL NOT NULL
		);
		`,
	}

	for _, statement := range statements {
		if _, err := db.ExecContext(context.Background(), statement); err != nil {
			store.cleanup()
			return nil, fmt.Errorf("set up node store schema: %w", err)
		}
	}

	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		store.cleanup()
		return nil, fmt.Errorf("begin node store transaction: %w", err)
	}
	store.tx = tx

	store.insertStmt, err = tx.PrepareContext(context.Background(), `INSERT INTO node_locations (id, lat, lon) VALUES (?, ?, ?)`)
	if err != nil {
		store.cleanup()
		return nil, fmt.Errorf("prepare node insert: %w", err)
	}

	store.lookupStmt, err = tx.PrepareContext(context.Background(), `SELECT lat, lon FROM node_locations WHERE id = ?`)
	if err != nil {
		store.cleanup()
		return nil, fmt.Errorf("prepare node lookup: %w", err)
	}

	return store, nil
}

func (store *nodeStore) add(id int64, lat float64, lon float64) error {
	if _, err := store.insertStmt.ExecContext(context.Background(), id, lat, lon); err != nil {
		return fmt.Errorf("insert node location: %w", err)
	}

	return nil
}

func (store *nodeStore) coordinates(nodeIDs []int64) ([]coordinate, error) {
	coordinates := make([]coordinate, 0, len(nodeIDs))

	for _, nodeID := range nodeIDs {
		var lat float64
		var lon float64

		err := store.lookupStmt.QueryRowContext(context.Background(), nodeID).Scan(&lat, &lon)
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("look up node %d: %w", nodeID, err)
		}

		coordinates = append(coordinates, coordinate{Lat: lat, Lon: lon})
	}

	return coordinates, nil
}

func (store *nodeStore) cleanup() {
	if store.insertStmt != nil {
		_ = store.insertStmt.Close()
		store.insertStmt = nil
	}

	if store.lookupStmt != nil {
		_ = store.lookupStmt.Close()
		store.lookupStmt = nil
	}

	if store.tx != nil {
		_ = store.tx.Rollback()
		store.tx = nil
	}

	if store.db != nil {
		_ = store.db.Close()
		store.db = nil
	}

	if store.path != "" {
		_ = os.Remove(store.path)
		store.path = ""
	}
}

func loadXMLWays(inputPath string, writer *packWriter) error {
	file, err := os.Open(inputPath)
	if err != nil {
		return fmt.Errorf("open XML input: %w", err)
	}
	defer file.Close()

	decoder := xml.NewDecoder(file)
	nodes := make(map[int64]coordinate)

	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("decode XML token: %w", err)
		}

		startElement, ok := token.(xml.StartElement)
		if !ok {
			continue
		}

		switch startElement.Name.Local {
		case "node":
			var node xmlNode
			if err := decoder.DecodeElement(&node, &startElement); err != nil {
				return fmt.Errorf("decode XML node: %w", err)
			}

			nodes[node.ID] = coordinate{Lat: node.Lat, Lon: node.Lon}
		case "way":
			var way xmlWay
			if err := decoder.DecodeElement(&way, &startElement); err != nil {
				return fmt.Errorf("decode XML way: %w", err)
			}

			tags := make(map[string]string, len(way.Tags))
			for _, tag := range way.Tags {
				tags[tag.Key] = tag.Value
			}

			resolvedLimit := writer.prepareWay(tags)
			if resolvedLimit == nil {
				continue
			}

			coordinates := make([]coordinate, 0, len(way.Refs))
			for _, ref := range way.Refs {
				coordinate, ok := nodes[ref.Ref]
				if ok {
					coordinates = append(coordinates, coordinate)
				}
			}

			if err := writer.addPreparedWay(way.ID, resolvedLimit, coordinates); err != nil {
				return err
			}
		}
	}
}

func loadPBFWays(inputPath string, writer *packWriter) error {
	file, err := os.Open(inputPath)
	if err != nil {
		return fmt.Errorf("open PBF input: %w", err)
	}
	defer file.Close()

	nodeStore, err := newNodeStore()
	if err != nil {
		return err
	}
	defer nodeStore.cleanup()

	decoder := osmpbf.NewDecoder(file)
	if err := decoder.Start(runtime.GOMAXPROCS(0)); err != nil {
		return fmt.Errorf("start PBF decoder: %w", err)
	}

	for {
		entity, err := decoder.Decode()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("decode PBF entity: %w", err)
		}

		switch typed := entity.(type) {
		case *osmpbf.Node:
			if err := nodeStore.add(typed.ID, typed.Lat, typed.Lon); err != nil {
				return err
			}
		case *osmpbf.Way:
			resolvedLimit := writer.prepareWay(typed.Tags)
			if resolvedLimit == nil {
				continue
			}

			coordinates, err := nodeStore.coordinates(typed.NodeIDs)
			if err != nil {
				return err
			}

			if err := writer.addPreparedWay(typed.ID, resolvedLimit, coordinates); err != nil {
				return err
			}
		}
	}
}

func computeMD5(filePath string) (string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return "", fmt.Errorf("open file for md5: %w", err)
	}
	defer file.Close()

	hasher := md5.New()
	if _, err := io.Copy(hasher, file); err != nil {
		return "", fmt.Errorf("hash file: %w", err)
	}

	return fmt.Sprintf("%x", hasher.Sum(nil)), nil
}

func ensureInputFile(args cliArgs) (string, func(), error) {
	if strings.TrimSpace(args.Input) != "" {
		return args.Input, func() {}, nil
	}

	if strings.TrimSpace(args.InputURL) == "" {
		return "", nil, fmt.Errorf("either --input or --input-url must be provided")
	}

	tempDir, err := os.MkdirTemp("", "speed-limit-pack-build-")
	if err != nil {
		return "", nil, fmt.Errorf("create download directory: %w", err)
	}

	cleanup := func() {
		_ = os.RemoveAll(tempDir)
	}

	parsedURL, err := url.Parse(args.InputURL)
	if err != nil {
		cleanup()
		return "", nil, fmt.Errorf("parse input URL: %w", err)
	}

	fileName := path.Base(parsedURL.Path)
	if fileName == "." || fileName == "/" || fileName == "" {
		fileName = "input.osm.pbf"
	}

	targetPath := filepath.Join(tempDir, fileName)
	response, err := http.Get(args.InputURL)
	if err != nil {
		cleanup()
		return "", nil, fmt.Errorf("download input extract: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		cleanup()
		return "", nil, fmt.Errorf("download input extract: unexpected status %s", response.Status)
	}

	outputFile, err := os.Create(targetPath)
	if err != nil {
		cleanup()
		return "", nil, fmt.Errorf("create downloaded input file: %w", err)
	}

	if _, err := io.Copy(outputFile, response.Body); err != nil {
		_ = outputFile.Close()
		cleanup()
		return "", nil, fmt.Errorf("write downloaded input file: %w", err)
	}

	if err := outputFile.Close(); err != nil {
		cleanup()
		return "", nil, fmt.Errorf("close downloaded input file: %w", err)
	}

	return targetPath, cleanup, nil
}

func buildManifest(outputDB string, outputManifest string, args cliArgs, result buildResult) error {
	if err := os.MkdirAll(filepath.Dir(outputManifest), 0o755); err != nil {
		return fmt.Errorf("create manifest directory: %w", err)
	}

	hash, err := computeMD5(outputDB)
	if err != nil {
		return err
	}

	stat, err := os.Stat(outputDB)
	if err != nil {
		return fmt.Errorf("stat output database: %w", err)
	}

	payload := manifest{
		SchemaVersion:   1,
		GeneratedAt:     args.SourceTimestamp,
		RegionID:        args.RegionID,
		RegionName:      args.RegionName,
		PackVersion:     args.PackVersion,
		SourceTimestamp: args.SourceTimestamp,
		DownloadURL:     args.DownloadURL,
		MD5:             hash,
		SizeBytes:       stat.Size(),
		Bounds:          result.Bounds,
		OSMAttribution:  "Contains OpenStreetMap data © OpenStreetMap contributors (ODbL).",
	}

	encoded, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return fmt.Errorf("encode manifest JSON: %w", err)
	}

	if err := os.WriteFile(outputManifest, encoded, 0o644); err != nil {
		return fmt.Errorf("write manifest JSON: %w", err)
	}

	return nil
}

func parseArgs(argv []string) (cliArgs, error) {
	args := cliArgs{}

	flagSet := flag.NewFlagSet("build_speed_limit_pack", flag.ContinueOnError)
	flagSet.StringVar(&args.Input, "input", "", "Path to a local .osm or .osm.pbf extract.")
	flagSet.StringVar(&args.InputURL, "input-url", "", "Remote URL for a .osm.pbf extract to download.")
	flagSet.StringVar(&args.OutputDB, "output-db", "", "Path to the output SQLite pack.")
	flagSet.StringVar(&args.OutputManifest, "output-manifest", "", "Path to the output manifest JSON.")
	flagSet.StringVar(&args.DownloadURL, "download-url", "", "Download URL to place in the generated manifest.")
	flagSet.StringVar(&args.RegionID, "region-id", "", "Region id for the generated pack.")
	flagSet.StringVar(&args.RegionName, "region-name", "", "Human-readable region name.")
	flagSet.StringVar(&args.PackVersion, "pack-version", "", "Pack version string.")
	flagSet.StringVar(&args.SourceTimestamp, "source-timestamp", "", "UTC timestamp for the source data/version.")

	if err := flagSet.Parse(argv); err != nil {
		return cliArgs{}, err
	}

	required := map[string]string{
		"--output-db":        args.OutputDB,
		"--output-manifest":  args.OutputManifest,
		"--download-url":     args.DownloadURL,
		"--region-id":        args.RegionID,
		"--region-name":      args.RegionName,
		"--pack-version":     args.PackVersion,
		"--source-timestamp": args.SourceTimestamp,
	}

	for flagName, value := range required {
		if strings.TrimSpace(value) == "" {
			return cliArgs{}, fmt.Errorf("%s is required", flagName)
		}
	}

	if strings.TrimSpace(args.Input) == "" && strings.TrimSpace(args.InputURL) == "" {
		return cliArgs{}, fmt.Errorf("either --input or --input-url must be provided")
	}

	return args, nil
}

func run(argv []string, stdout io.Writer, stderr io.Writer) int {
	args, err := parseArgs(argv)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}

	inputPath, cleanupInput, err := ensureInputFile(args)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	defer cleanupInput()

	writer, err := newPackWriter(args.OutputDB)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	finalized := false
	defer func() {
		if !finalized {
			writer.cleanup()
		}
	}()

	inputName := strings.ToLower(filepath.Base(inputPath))
	if strings.HasSuffix(inputName, ".osm.pbf") || filepath.Ext(inputName) == ".pbf" {
		err = loadPBFWays(inputPath, writer)
	} else {
		err = loadXMLWays(inputPath, writer)
	}
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}

	result, err := writer.finalize()
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	finalized = true

	if err := buildManifest(args.OutputDB, args.OutputManifest, args, result); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}

	output := buildOutput{
		OutputDB:       args.OutputDB,
		OutputManifest: args.OutputManifest,
	}

	encoder := json.NewEncoder(stdout)
	if err := encoder.Encode(output); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}

	return 0
}

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}
