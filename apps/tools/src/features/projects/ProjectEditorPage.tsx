import { MixedGifBuilder } from '@/features/mixed-gif/MixedGifBuilder';
import type { SourceVideo, ToolProject } from '@/lib/types';

interface ProjectEditorPageProps {
  project: ToolProject;
  projects: ToolProject[];
  sourceVideos: SourceVideo[];
  onProjectChange: (project: ToolProject) => void;
  onProjectsRefresh: () => Promise<void>;
}

function formatDuration(value?: number) {
  if (!value) {
    return 'unknown';
  }
  return `${value.toFixed(1)}s`;
}

export function ProjectEditorPage({
  project,
  projects,
  sourceVideos,
  onProjectChange,
  onProjectsRefresh,
}: ProjectEditorPageProps) {
  return (
    <div className="project-editor-page">
      <section className="project-summary">
        <div>
          <strong>{project.flowSlug || 'Mixed GIF'}</strong>
          <span>{project.sourceVideoFilename}</span>
        </div>
        <div>
          <strong>{formatDuration(project.sourceVideoDuration)}</strong>
          <span>{project.sourceVideoWidth || 0}x{project.sourceVideoHeight || 0}</span>
        </div>
      </section>

      <MixedGifBuilder
        onProjectChange={onProjectChange}
        onProjectsRefresh={onProjectsRefresh}
        project={project}
        projects={projects}
        sourceVideos={sourceVideos}
      />
    </div>
  );
}
