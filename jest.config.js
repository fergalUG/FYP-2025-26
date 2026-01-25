module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@components(.*)$': '<rootDir>/src/components$1',
    '^@screens(.*)$': '<rootDir>/src/screens$1',
    '^@utils(.*)$': '<rootDir>/src/utils$1',
    '^@services(.*)$': '<rootDir>/src/services$1',
    '^@hooks(.*)$': '<rootDir>/src/hooks$1',
    '^@types(.*)$': '<rootDir>/src/types$1',
    '^@constants(.*)$': '<rootDir>/src/constants$1',
    '^@theme$': '<rootDir>/src/theme',
    '^@modules(.*)$': '<rootDir>/modules$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/app/**/*', '!src/types/**/*'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
