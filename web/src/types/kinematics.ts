export type PublicKinematicsRow = Record<string, string>;

export type KinematicsChunk = {
  path: string;
  recordCount: number;
  sourceKind: string;
  sourceProvider: string;
  sourceName: string;
  sourceRef: string;
  sha256: string;
  bytes: number;
};

export type KinematicsSource = {
  sourceKind: string;
  sourceProvider: string;
  sourceName: string;
  sourceRef: string;
  sourceTable: string;
  sourceUrl: string;
  recordCount: number;
  lineOfSightVelocityRecords: number;
  properMotionRecords: number;
  metallicityRecords: number;
  membershipProbabilityRecords: number;
  membershipProbabilityInheritedRecords: number;
  membershipFlagRecords: number;
  membershipFlagInheritedRecords: number;
};

export type KinematicsManifest = {
  schemaVersion: number;
  objectKey: string;
  objectName: string;
  sourceInputSha256: string;
  sourceSnapshotModifiedAt: string;
  publicDataSha256: string;
  columnDictionaryPath: string;
  columns: string[];
  totalRecords: number;
  chunkSize: number;
  chunks: KinematicsChunk[];
  sources: KinematicsSource[];
  semantics: {
    recordUnit: string;
    membership: string;
  };
};

export type KinematicsChunkPayload = {
  schemaVersion: number;
  objectKey: string;
  columns: string[];
  rows: PublicKinematicsRow[];
};
