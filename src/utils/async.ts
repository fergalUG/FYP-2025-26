export const executeWithLoading = async <T>(operation: () => Promise<T>, setLoading: (loading: boolean) => void): Promise<T | null> => {
  try {
    setLoading(true);
    const result = await operation();
    return result;
  } catch (error) {
    console.error('Operation failed:', error);
    return null;
  } finally {
    setLoading(false);
  }
};
