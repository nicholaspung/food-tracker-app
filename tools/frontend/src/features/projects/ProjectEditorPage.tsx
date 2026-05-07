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
  const hasSourceVideo = Boolean(project.sourceVideoPath);

  return (
    <div className="project-editor-page">
      <section className="project-summary">
        <div>
          <strong>{hasSourceVideo ? project.flowSlug || 'Mixed GIF' : 'Asset library project'}</strong>
          <span>{hasSourceVideo ? project.sourceVideoFilename : 'No source video'}</span>
        </div>
        <div>
          <strong>{hasSourceVideo ? formatDuration(project.sourceVideoDuration) : `${project.editorState.items.length} timeline items`}</strong>
          <span>{hasSourceVideo ? `${project.sourceVideoWidth || 0}x${project.sourceVideoHeight || 0}` : `${project.assets?.length || 0} saved assets`}</span>
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
