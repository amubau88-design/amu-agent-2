/** Contract for a future OS-isolated backend. No backend is enabled by this declaration. */
export type ApprovedExecutionProfile={
 id:string;kind:'unit'|'integration'|'build';
 executable:string;arguments:readonly string[];
 approvalDigest:string;approvedBy:string;
 limits:{wallTimeMs:number;memoryMiB:number;cpuCount:number;processCount:number;outputBytes:number};
};
export type SourceSnapshot={id:string;digest:string;readOnlyInputDirectory:string;disposableOutputDirectory:string};
export type IsolatedRunResult={exitCode:number|null;stdout:string;stderr:string;status:'passed'|'failed'|'cancelled'|'timed_out';snapshotDigest:string};
export interface IsolatedRunnerAdapter {
 readonly isolation:'operating-system';
 /** Must represent an independently tested installed runtime, never an administrator toggle alone. */
 verifyInstallation():Promise<{available:boolean;runtimeVersion:string;networkDisabled:boolean;unprivileged:boolean;credentialsAbsent:boolean;resourceLimitsEnforced:boolean;processTreeCancellation:boolean}>;
 run(profile:ApprovedExecutionProfile,snapshot:SourceSnapshot,signal:AbortSignal):Promise<IsolatedRunResult>;
 /** Must terminate the entire disposable environment, including descendant processes. */
 cancel(runId:string):Promise<void>;
}
