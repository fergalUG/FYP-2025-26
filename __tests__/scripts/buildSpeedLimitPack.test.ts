import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const fixturePath = path.join(process.cwd(), '__tests__', 'fixtures', 'speed-limit-pack', 'sample.osm');
const scriptPath = path.join(process.cwd(), 'scripts', 'build_speed_limit_pack.py');

const readJson = (filePath: string) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

describe('build_speed_limit_pack.py', () => {
  let tempDir: string;
  let outputDb: string;
  let outputManifest: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'speed-limit-pack-builder-'));
    outputDb = path.join(tempDir, 'speed-limit-pack-ie-ni.sqlite');
    outputManifest = path.join(tempDir, 'speed-limit-pack-manifest.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('builds a fixture pack with normalized limits and excluded conflicts', () => {
    execFileSync('python3', [
      scriptPath,
      '--input',
      fixturePath,
      '--output-db',
      outputDb,
      '--output-manifest',
      outputManifest,
      '--download-url',
      'https://example.com/speed-limit-pack-ie-ni.sqlite',
      '--region-id',
      'ie-ni',
      '--region-name',
      'Ireland + Northern Ireland',
      '--pack-version',
      'test-version',
      '--source-timestamp',
      '2026-03-17T00:00:00Z',
    ]);

    const manifest = readJson(outputManifest);
    expect(manifest.regionId).toBe('ie-ni');
    expect(manifest.packVersion).toBe('test-version');
    expect(typeof manifest.md5).toBe('string');
    expect(manifest.md5).toHaveLength(32);
    expect(manifest.sizeBytes).toBeGreaterThan(0);

    const queryOutput = execFileSync('python3', [
      '-c',
      [
        'import json, sqlite3, sys',
        'db = sqlite3.connect(sys.argv[1])',
        'rows = db.execute("SELECT way_id, speed_limit_kmh, raw_speed_tag, raw_source_tag FROM road_segments ORDER BY way_id").fetchall()',
        'metadata = dict(db.execute("SELECT key, value FROM pack_metadata").fetchall())',
        'print(json.dumps({"rows": rows, "metadata": metadata}))',
      ].join(';'),
      outputDb,
    ]).toString();

    const payload = JSON.parse(queryOutput) as {
      rows: Array<[number, number, string | null, string | null]>;
      metadata: Record<string, string>;
    };

    const rowsByWayId = new Map(payload.rows.map((row) => [row[0], row]));

    expect(rowsByWayId.get(1001)?.[1]).toBe(50);
    expect(rowsByWayId.get(1002)?.[1]).toBe(80.5);
    expect(rowsByWayId.get(1003)?.[1]).toBe(80);
    expect(rowsByWayId.get(1004)?.[1]).toBe(60);
    expect(rowsByWayId.has(1005)).toBe(false);
    expect(rowsByWayId.get(1006)?.[1]).toBe(50);
    expect(rowsByWayId.get(1007)?.[1]).toBe(96.6);
    expect(rowsByWayId.has(1008)).toBe(false);
    expect(payload.metadata.roadsSkippedDirectionalConflict).toBe('1');
  });
});
