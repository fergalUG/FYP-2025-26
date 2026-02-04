export const getBrakingForceThreshold = (speedKmh: number): number => {
  if (speedKmh < 20) return 0.45;
  if (speedKmh < 50) return 0.4;
  if (speedKmh < 80) return 0.35;
  return 0.3;
};

export const getBrakingSpeedChangeThreshold = (speedKmh: number): number => {
  if (speedKmh < 20) return -22;
  if (speedKmh < 50) return -18;
  if (speedKmh < 80) return -14;
  return -12;
};

export const getAccelerationForceThreshold = (speedKmh: number): number => {
  if (speedKmh < 20) return 0.32;
  if (speedKmh < 50) return 0.28;
  if (speedKmh < 80) return 0.26;
  return 0.24;
};

export const getAccelerationSpeedChangeThreshold = (speedKmh: number): number => {
  if (speedKmh < 20) return 15;
  if (speedKmh < 50) return 12;
  if (speedKmh < 80) return 9;
  return 7;
};

export const getCorneringForceThreshold = (speedKmh: number): number => {
  if (speedKmh < 20) return 0.65;
  if (speedKmh < 50) return 0.55;
  if (speedKmh < 80) return 0.5;
  return 0.45;
};

export const getCorneringHeadingThreshold = (speedKmh: number): number => {
  if (speedKmh < 20) return 35;
  if (speedKmh < 50) return 25;
  if (speedKmh < 80) return 20;
  return 15;
};
