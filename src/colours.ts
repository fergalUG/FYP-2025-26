const palette = {
  Onyx: '#131515',
  Graphite: '#2b2c28',
  Verdigris: '#339989',
  PaleSlate: '#cac4ce',
  Linen: '#f7ece1',

  VerdigrisLight: '#70B8AC',
  VerdigrisDark: '#1F5C52',

  Rust: '#BC5D2E',
  Gold: '#D6A445',
  Slate: '#7A7A85',

  White: '#FFFFFF',
  Red: '#FF3B30',
  Orange: '#FF9500',
};

const colours = {
  ...palette,

  MainBackground: palette.Linen,
  CardBackground: palette.White,

  PrimaryText: palette.Onyx,
  SecondaryText: palette.Graphite,
  AltText: palette.White,
  DisabledText: palette.Slate,

  AccentColor: palette.Verdigris,
  AccentLight: palette.VerdigrisLight,
  AccentDark: palette.VerdigrisDark,

  ShadowColor: palette.Graphite,
  BorderColor: palette.PaleSlate,

  Success: palette.Verdigris,
  Error: palette.Red,
  Warning: palette.Rust,

  AxisX: palette.Red,
  AxisY: palette.Verdigris,
  AxisZ: palette.Onyx,
};

export default colours;
