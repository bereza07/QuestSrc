export interface Migration {
  version: number;
  name: string;
  /** Individual SQL statements, run in order. One statement per string so the
   *  runner works on adapters that execute a single statement per call. */
  statements: string[];
}
