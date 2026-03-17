# VeloMetry

VeloMetry is a mobile application for tracking driving journeys, collecting motion and location data, and turning those signals into driving efficiency scores. The project is built with Expo and React Native to combine smartphone sensors, background services, local persistence, and scoring logic into a practical vehicle telemetry experience.

Rather than focusing only on trip recording, the app is structured to detect journeys in the background, capture notable driving events, persist them locally, and present the results through summary screens, detailed journey views, and route maps.

## Project Purpose

VeloMetry addresses a clear technical problem: how to build a mobile system that can observe a user's driving behaviour using device sensors without relying on dedicated in-car hardware. The project investigates how background location updates, motion signals, event detection, and local analytics can be orchestrated into a coherent mobile application.

The primary goal of the project is to demonstrate an end-to-end telemetry pipeline inside a modern React Native application. That includes:

- detecting when a journey starts and ends
- recording route and event data locally on the device
- deriving a driving efficiency score from collected events
- presenting interpretable results through a mobile interface
- supporting inspection through logs, exports, and debug tooling

## Core Capabilities

- Background journey detection using passive and active tracking modes.
- Trip logging with persisted journey records and timestamped event data.
- Driving efficiency scoring based on detected behaviours such as speeding, braking, acceleration, cornering, oscillation, and stop-and-go patterns.
- Journey history views for reviewing completed trips and their recorded scores.
- Journey detail screens that combine summary metrics, score visualisation, and mapped routes.
- Route map rendering with journey markers, incident overlays, and supporting legend information.
- Local data storage using on-device SQLite persistence for journeys, events, and settings.
- Debug controls for inspecting tracking state and background-service behaviour during development and evaluation.
- Export functionality for logs and database contents for external analysis and improvement.

## How It Works

1. The app monitors background location and motion-related signals through a service layer designed around passive observation and active tracking.
2. When the tracking logic identifies driving activity, a journey is started and location updates are processed as structured events.
3. Motion and GPS data are passed through validation, smoothing, and detection utilities to identify driving behaviours worth recording.
4. Journey records, event logs, and settings are stored locally in SQLite using Drizzle ORM-backed schema definitions.
5. The efficiency-scoring pipeline evaluates the recorded journey events and produces a score plus supporting statistics.
6. The UI surfaces this information through the home screen, journey history, detail pages, route maps, and settings/debug views.

## Tools and Technologies Used

### Mobile Application Stack

- Expo
- React Native 0.81.5
- React 19.1.0
- TypeScript 5.9.2

### Navigation and UI

- Expo Router for file-based navigation
- React Native Gesture Handler for touch and swipe interactions
- React Native Safe Area Context for device-safe layouts
- React Native SVG for score visualisation

### Data and Persistence

- Expo SQLite for on-device database storage
- Drizzle ORM for typed schema definitions and queries

### Sensing and Background Operation

- Expo Location for foreground and background location updates
- Expo Task Manager for background task orchestration
- Custom `vehicle-motion` Expo module for iOS motion and activity integration

### Mapping and Visualisation

- react-native-maps for route and event map rendering

## Architecture Overview

The codebase is organised around a layered mobile architecture that separates navigation, UI composition, domain logic, persistence, and low-level utilities.

- `src/app` contains Expo Router route files for the main tabs, journey detail views, and map screens.
- `src/components` contains reusable presentation components for the home screen, score display, map rendering, and journey statistics.
- `src/hooks` provides app-facing hooks and providers for theme state, background service access, toast notifications, debug controls, and journey data loading.
- `src/services` contains the core application logic, including background tracking orchestration, journey lifecycle management, efficiency scoring, logging, settings, and detector modules.
- `src/db` defines the SQLite client and Drizzle schema for journeys, events, and settings.
- `src/utils` contains helper logic for scoring, GPS validation, retry behaviour, health monitoring, threshold handling, and general app utilities.
- `src/types` centralises domain and service types used across the application.
- `modules/vehicle-motion` contains the custom iOS Expo module used to expose native motion and activity updates to the JavaScript layer.

At a high level, the service layer sits between the device signals and the interface. Background tracking services collect and interpret raw input, persistence services store the resulting records, scoring utilities derive analytics, and the routed UI presents those results back to the user.

## Project Structure

```text
VeloMetry/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── expo-doctor.yml
│       └── security-audit.yml
├── assets/
├── modules/
│   └── vehicle-motion/
│       ├── ios/
│       ├── src/
│       ├── expo-module.config.json
│       ├── index.ts
│       └── package.json
├── src/
│   ├── app/
│   │   ├── (tabs)/
│   │   └── journey/
│   ├── components/
│   │   ├── common/
│   │   ├── home/
│   │   └── journey/
│   ├── constants/
│   ├── db/
│   ├── hooks/
│   ├── services/
│   │   ├── background/
│   │   └── detectors/
│   ├── types/
│   │   └── services/
│   ├── utils/
│   │   ├── async/
│   │   ├── scoring/
│   │   └── tracking/
│   └── theme.ts
├── app.json
├── package.json
└── tsconfig.json
```

## Platform and Permissions

- VeloMetry depends on location access for journey detection, route logging, and map visualisation.
- The app is configured for background location usage and includes the required iOS location permission descriptions in `app.json`.
- The project also requests motion access so the app can use device activity signals to improve trip detection.
- The custom `vehicle-motion` module is implemented for iOS, and the repository should therefore be understood as having iOS-specific motion functionality rather than full platform parity.
- Local persistence is handled on-device, so journey and event data remain in the app's local SQLite store unless explicitly exported.
