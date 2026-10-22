import { runConformanceCases } from '../harness.ts';
import { validatePipelineStructure, type PipelineAction } from '../../../src/engine/cicd/pipeline.ts';

// Official sources checked 2026-10-18. These tests concern configuration validation;
// network/IAM denial, health and recovery do not apply to artifact cardinality checks.
const nodes: any[] = ['repo', 'build', 'deploy'].map((id, i) => ({ id, data: { serviceId: ['codecommit', 'codebuild', 'codedeploy'][i] } }));
const source: PipelineAction = { name: 'Source', category: 'Source', provider: 'CodeCommit', nodeId: 'repo', inputArtifacts: [], outputArtifacts: ['Src', 'Other'] };
function issues(inputArtifacts: string[], outputArtifacts: string[], primarySource?: string) {
  return validatePipelineStructure([
    { name: 'Source', actions: [{ ...source, outputArtifacts: ['Src'] }, { ...source, name: 'Other', outputArtifacts: ['Other'] }] },
    { name: 'Build', actions: [{ name: 'Build', category: 'Build', provider: 'CodeBuild', nodeId: 'build', inputArtifacts, outputArtifacts, primarySource }] }
  ], nodes);
}
runConformanceCases([
  { id: 'CICD-ARTIFACT-COUNT-001', awsBehavior: 'CodeBuild pipeline actions consume 1–5 artifacts and produce 0–5 artifacts.',
    reference: 'https://docs.aws.amazon.com/codepipeline/latest/userguide/reference-action-artifacts.html',
    scenario: 'Reject zero/six inputs or six outputs; allow one input with no outputs', configuration: {}, request: {},
    expected: [true, true, true, false],
    run: () => [issues([], []), issues(Array(6).fill('Src'), [], 'Src'), issues(['Src'], ['a','b','c','d','e','f']), issues(['Src'], [])].map(x => x.some(i => i.problem.includes('artifact count'))),
    explain: a => JSON.stringify(a) },
  { id: 'CICD-PRIMARY-001', awsBehavior: 'Multiple CodeBuild inputs require PrimarySource naming one of the inputs.',
    reference: 'https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-CodeBuild.html',
    scenario: 'Reject absent/foreign primary input; accept a declared input', configuration: {}, request: {},
    expected: [true, true, false],
    run: () => [undefined, 'Missing', 'Other'].map(primary => issues(['Src','Other'], ['Out'], primary).some(i => i.problem.includes('PrimarySource'))),
    explain: a => JSON.stringify(a) },
  { id: 'CICD-SOURCE-COUNT-001', awsBehavior: 'CodeCommit sources produce exactly one artifact; CodeDeploy consumes exactly one.',
    reference: 'https://docs.aws.amazon.com/codepipeline/latest/userguide/reference-action-artifacts.html',
    scenario: 'Reject two source outputs and a deployment without an input revision', configuration: {}, request: {}, expected: 2,
    run: () => validatePipelineStructure([
      { name: 'Source', actions: [source] },
      { name: 'Deploy', actions: [{ name: 'Deploy', category: 'Deploy', provider: 'CodeDeploy', nodeId: 'deploy', inputArtifacts: [], outputArtifacts: [] }] }
    ], nodes).filter(i => i.problem.includes('artifact count')).length,
    explain: a => `${a} invalid artifact declarations` }
]);
