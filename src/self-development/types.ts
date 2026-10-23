export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface SelfAnalysisReport {
  timestamp: string;
  analyzedFilesCount: number;
  identifiedBottlenecks: string[];
  metricsSummary: {
    avgResponseTimeMs: number;
    heapMemoryMb: number;
    testSuccessRate: number;
  };
  improvementOpportunities: Array<{
    category: 'performance' | 'routing' | 'security' | 'testing' | 'memory' | 'quality';
    targetFile: string;
    description: string;
    estimatedImpact: string;
  }>;
}

export interface ImprovementProposal {
  id: string;
  timestamp: string;
  title: string;
  category: string;
  description: string;
  targetFiles: string[];
  proposedChanges: Array<{
    file: string;
    patchDescription: string;
  }>;
  riskAssessment: {
    level: RiskLevel;
    potentialSideEffects: string[];
    mitigationStrategy: string;
  };
  expectedBenefits: string[];
  sandboxTestResult?: {
    testsPassed: boolean;
    beforeResponseTimeMs: number;
    afterResponseTimeMs: number;
    beforeMemoryMb: number;
    afterMemoryMb: number;
    securityCheckPassed: boolean;
  };
  rollbackPlan: {
    backupPath: string;
    rollbackCommand: string;
    automaticRollbackOnFailure: boolean;
  };
  status: 'PENDING_ADMIN_APPROVAL' | 'APPROVED' | 'REJECTED' | 'PROMOTED' | 'ROLLED_BACK';
}

export interface SelfImprovementRecord {
  version: string;
  proposalId: string;
  appliedAt?: string;
  adminApproved: boolean;
  approvedBy?: string;
  status: string;
  metricsBeforeAfter: {
    beforeMs: number;
    afterMs: number;
    beforeMemoryMb: number;
    afterMemoryMb: number;
  };
}
