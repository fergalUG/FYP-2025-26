import type { SpeedBand } from '@/types/tracking';

export const getBrakingForceThreshold = (band: SpeedBand): number => {
  switch (band) {
    case 'low':
      return 0.45;
    case 'mid':
      return 0.4;
    case 'high':
      return 0.35;
    case 'very_high':
      return 0.3;
  }
};

export const getBrakingSpeedChangeThreshold = (band: SpeedBand): number => {
  switch (band) {
    case 'low':
      return -22;
    case 'mid':
      return -18;
    case 'high':
      return -14;
    case 'very_high':
      return -12;
  }
};

export const getAccelerationForceThreshold = (band: SpeedBand): number => {
  switch (band) {
    case 'low':
      return 0.32;
    case 'mid':
      return 0.28;
    case 'high':
      return 0.26;
    case 'very_high':
      return 0.24;
  }
};

export const getAccelerationSpeedChangeThreshold = (band: SpeedBand): number => {
  switch (band) {
    case 'low':
      return 15;
    case 'mid':
      return 12;
    case 'high':
      return 9;
    case 'very_high':
      return 7;
  }
};

export const getCorneringForceThreshold = (band: SpeedBand): number => {
  switch (band) {
    case 'low':
      return 0.65;
    case 'mid':
      return 0.55;
    case 'high':
      return 0.5;
    case 'very_high':
      return 0.45;
  }
};

export const getCorneringHeadingThreshold = (band: SpeedBand): number => {
  switch (band) {
    case 'low':
      return 35;
    case 'mid':
      return 25;
    case 'high':
      return 20;
    case 'very_high':
      return 15;
  }
};
