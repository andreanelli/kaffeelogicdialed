export type Point = { time: number; temperature: number; fan?: number };
export type Base = { id: string; createdAt: string; demo?: boolean };
export type Bean = Base & {
  name: string;
  origin: string;
  process: string;
  variety: string;
  stock: number | null;
  notes: string;
};
export type Profile = Base & { name: string; description: string };
export type Version = Base & {
  profileId: string;
  number: number;
  name: string;
  description: string;
  level: number;
  points: Point[];
  changeNote: string;
  sourceFileId?: string;
  native?: {
    kind: "profile" | "log";
    codecVersion: string;
    sourceHash: string;
    patch: Record<string, string>;
  };
};
export type Roast = Base & {
  name: string;
  beanId: string;
  profileVersionId: string;
  experimentId: string | null;
  roastedAt: string;
  greenWeight: number;
  roastedWeight: number;
  duration: number;
  firstCrack: number | null;
  level: number;
  notes: string;
  points: Point[] | null;
  fileId: string | null;
  inventoryConsumed?: boolean;
  source?: { kind: string; timingNote?: string };
};
export type Cupping = Base & {
  roastId: string;
  taster: string;
  tastedAt: string;
  score: number | null;
  aroma: number | null;
  acidity: number | null;
  sweetness: number | null;
  body: number | null;
  finish: number | null;
  notes: string;
};
export type Experiment = Base & {
  name: string;
  hypothesis: string;
  variable: string;
  status: "planned" | "active" | "complete";
  conclusion: string;
};
export type ArchiveFile = {
  id: string;
  name: string;
  sha256: string;
  size: number;
  createdAt: string;
};
export type DeviceRun = Base & {
  roastId?: string;
  name: string;
  roastedAt: string | null;
  duration: number | null;
  level: number | null;
  firstCrack: number | null;
  category: "recorded" | "short" | "incomplete";
  sourceFileId: string | null;
  files: { id: string; name: string; sha256: string }[];
};
export type State = {
  deviceRuns: DeviceRun[];
  beans: Bean[];
  profiles: Profile[];
  versions: Version[];
  roasts: Roast[];
  cuppings: Cupping[];
  experiments: Experiment[];
  files: ArchiveFile[];
};
export type Device = {
  connected: boolean;
  mode: string;
  hardwareVerified: boolean;
  profiles: { id: string; name: string; versionId: string; syncedAt: string }[];
  jobs: { id: string; name: string; status: string; completedAt: string }[];
  folder: { canImport: boolean; canStage: boolean };
};
