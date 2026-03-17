declare module 'node-forge' {
  interface ForgeDigest {
    update(message: string, encoding?: string): ForgeDigest;
    digest(): {
      toHex(): string;
    };
  }

  interface Forge {
    md: {
      sha256: {
        create(): ForgeDigest;
      };
    };
  }

  const forge: Forge;
  export default forge;
}
