# VeloMetry

VeloMetry is an iOS-only Expo / React Native app for tracking driving journeys and scoring driving behaviour.

## Features

- Automatic journey detection with passive and active tracking modes
- Route logging with locally stored journey and event history
- Driving score generation from behaviours like speeding, braking, acceleration, cornering, oscillation, and stop-and-go traffic
- Journey history and detail screens with trip summaries and score breakdowns
- Route map views with markers and event overlays
- Local SQLite storage for journeys, events, and app settings

## Tech Stack

- Expo
- React Native 0.81.5
- React 19.1.0
- TypeScript 5.9.2
- Drizzle ORM
- Custom iOS Expo module in `modules/vehicle-motion`

## Getting Started

### Prerequisites

- Node.js 25
- npm
- Xcode and iOS simulator support for local iOS development

### Install

```bash
npm install
```

### Run the App

```bash
npm start
```

`npm start` runs `expo start --ios` in this project.

To build and run directly on a connected iOS device:

```bash
npm run ios
```

## Available Scripts

```bash
npm start       # Start Expo for iOS
npm run ios     # Build/run on a connected iOS device
npm run lint    # Run ESLint
npm test        # Run Jest tests
npm run format  # Format with Prettier
npm run checks  # Format, lint, and test
```

## Project Structure

```text
src/
├── app/         Expo Router screens and layouts
├── components/  Reusable UI components
├── constants/   App constants and thresholds
├── db/          SQLite client and schema
├── hooks/       App hooks and providers
├── services/    Tracking, detection, logging, and settings logic
├── types/       Shared types
├── utils/       Helpers for tracking, scoring, app utilities, etc.
└── theme.ts     Theme configuration

modules/vehicle-motion/
└── iOS motion/activity integration used by the app
```

## Development Notes

- The app is local-first: all data is stored locally on device
- VeloMetry supports iOS only.
- Background location and motion permissions are required for journey detection and route tracking.
- The iOS simulator works for UI and general development, but motion and location logic must be tested on a physical device.
