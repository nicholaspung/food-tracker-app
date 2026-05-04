import { useEffect, useMemo, useState } from 'react';

import { AssetLibraryPage } from '@/features/projects/AssetLibraryPage';
import { ProjectEditorPage } from '@/features/projects/ProjectEditorPage';
import { VideoToolsHome, defaultProjectName } from '@/features/projects/VideoToolsHome';
import { createInitialState } from '@/features/mixed-gif/state';
import {
  archiveSourceVideo,
  createProject,
  deleteProject,
  listProjects,
  listSourceVideos,
  moveSourceVideo,
} from '@/lib/api';
import type { SourceVideo, ToolProject } from '@/lib/types';

type ToolsView =
  | { name: 'videoToolsHome' }
  | { name: 'projectEditor'; projectId: string }
  | { name: 'assetLibrary' };

function activeSidebarItem(view: ToolsView) {
  return view.name === 'assetLibrary' ? 'assetLibrary' : 'videoTools';
}

export function App() {
  const [sourceVideos, setSourceVideos] = useState<SourceVideo[]>([]);
  const [projects, setProjects] = useState<ToolProject[]>([]);
  const [view, setView] = useState<ToolsView>({ name: 'videoToolsHome' });
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [error, setError] = useState('');

  const selectedProject = useMemo(() => {
    if (view.name !== 'projectEditor') {
      return null;
    }
    return projects.find((project) => project.id === view.projectId) || null;
  }, [projects, view]);

  const selectedSource = useMemo(
    () => sourceVideos.find((sourceVideo) => sourceVideo.id === selectedSourceId) || null,
    [selectedSourceId, sourceVideos],
  );

  async function loadData() {
    setIsLoading(true);
    setError('');
    try {
      const [nextSources, nextProjects] = await Promise.all([
        listSourceVideos(),
        listProjects(),
      ]);
      setSourceVideos(nextSources);
      setProjects(nextProjects);
      setSelectedSourceId((current) => {
        const nextSelected = nextSources.find((sourceVideo) => sourceVideo.id === current) || nextSources[0] || null;
        setProjectName((currentName) => {
          if (nextSelected && current && nextSelected.id === current && currentName) {
            return currentName;
          }
          return nextSelected ? defaultProjectName(nextSelected) : '';
        });
        return nextSelected?.id || '';
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load tools data.');
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshProjects() {
    const nextProjects = await listProjects();
    setProjects(nextProjects);
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (view.name === 'projectEditor' && !selectedProject) {
      setView({ name: 'videoToolsHome' });
    }
  }, [selectedProject, view.name]);

  function handleSourceChange(sourceId: string) {
    setSelectedSourceId(sourceId);
    const sourceVideo = sourceVideos.find((item) => item.id === sourceId);
    setProjectName(sourceVideo ? defaultProjectName(sourceVideo) : '');
  }

  async function handleCreateProject() {
    if (!selectedSource) {
      setError('Choose a source video first.');
      return;
    }
    setIsCreating(true);
    setError('');
    try {
      const editorState = createInitialState(selectedSource);
      const project = await createProject({
        name: projectName.trim() || defaultProjectName(selectedSource),
        flowSlug: selectedSource.flowSlug,
        sourceVideoPath: selectedSource.path,
        sourceVideoFilename: selectedSource.filename,
        sourceVideoDuration: selectedSource.duration || 0,
        sourceVideoWidth: selectedSource.width || 0,
        sourceVideoHeight: selectedSource.height || 0,
        editorState,
        exportSettings: editorState.exportSettings,
      });
      setProjects((current) => [project, ...current]);
      setView({ name: 'projectEditor', projectId: project.id });
      setProjectName('');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not create project.');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDeleteProject(projectId: string) {
    setError('');
    try {
      await deleteProject(projectId);
      setProjects((current) => current.filter((project) => project.id !== projectId));
      setView((currentView) => (
        currentView.name === 'projectEditor' && currentView.projectId === projectId
          ? { name: 'videoToolsHome' }
          : currentView
      ));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete project.');
    }
  }

  async function handleArchiveSourceVideo(sourceVideoId: string) {
    setError('');
    try {
      await archiveSourceVideo(sourceVideoId);
      await loadData();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'Could not archive source video.');
    }
  }

  async function handleMoveSourceVideo(sourceVideoId: string, targetFlowSlug: string) {
    setError('');
    try {
      const movedSource = await moveSourceVideo(sourceVideoId, targetFlowSlug);
      await loadData();
      setSelectedSourceId(movedSource.id);
      setProjectName(defaultProjectName(movedSource));
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : 'Could not move source video.');
    }
  }

  function handleProjectChange(project: ToolProject) {
    setProjects((current) => current.map((item) => item.id === project.id ? project : item));
  }

  function renderBreadcrumbs() {
    return (
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <span>Tools</span>
        <span aria-hidden="true">/</span>
        {view.name === 'assetLibrary' ? (
          <span>Asset Library</span>
        ) : (
          <>
            {view.name === 'projectEditor' ? (
              <button onClick={() => setView({ name: 'videoToolsHome' })} type="button">Video Tools</button>
            ) : (
              <span>Video Tools</span>
            )}
            {view.name === 'projectEditor' && selectedProject ? (
              <>
                <span aria-hidden="true">/</span>
                <span>{selectedProject.name}</span>
              </>
            ) : null}
          </>
        )}
      </nav>
    );
  }

  function renderContent() {
    if (view.name === 'assetLibrary') {
      return <AssetLibraryPage onProjectsRefresh={refreshProjects} projects={projects} />;
    }

    if (view.name === 'projectEditor' && selectedProject) {
      return (
        <ProjectEditorPage
          onProjectChange={handleProjectChange}
          onProjectsRefresh={refreshProjects}
          project={selectedProject}
          projects={projects}
          sourceVideos={sourceVideos}
        />
      );
    }

    return (
      <VideoToolsHome
        isCreating={isCreating}
        isLoading={isLoading}
        onArchiveSourceVideo={handleArchiveSourceVideo}
        onCreateProject={handleCreateProject}
        onDeleteProject={handleDeleteProject}
        onMoveSourceVideo={handleMoveSourceVideo}
        onProjectNameChange={setProjectName}
        onSelectProject={(projectId) => setView({ name: 'projectEditor', projectId })}
        onSourceChange={handleSourceChange}
        projectName={projectName}
        projects={projects}
        selectedSourceId={selectedSourceId}
        sourceVideos={sourceVideos}
      />
    );
  }

  const activeItem = activeSidebarItem(view);

  return (
    <div className={`tools-shell${isSidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-block">
            <div className="brand-mark">YR</div>
            <div className="brand-copy">
              <strong>Yummy Recs</strong>
              <span>Tools</span>
            </div>
          </div>
          <button
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="sidebar-toggle"
            onClick={() => setIsSidebarCollapsed((value) => !value)}
            type="button"
          >
            <span aria-hidden="true">{isSidebarCollapsed ? 'Expand' : 'Hide'}</span>
          </button>
        </div>
        <nav className="nav-list" aria-label="Tools navigation">
          <button
            aria-label="Video Tools"
            className={activeItem === 'videoTools' ? 'active' : ''}
            onClick={() => setView({ name: 'videoToolsHome' })}
            title={isSidebarCollapsed ? 'Video Tools' : undefined}
            type="button"
          >
            <span className="nav-label">Video Tools</span>
            <span className="nav-short-label">Video</span>
          </button>
          <button
            aria-label="Asset Library"
            className={activeItem === 'assetLibrary' ? 'active' : ''}
            onClick={() => setView({ name: 'assetLibrary' })}
            title={isSidebarCollapsed ? 'Asset Library' : undefined}
            type="button"
          >
            <span className="nav-label">Asset Library</span>
            <span className="nav-short-label">Assets</span>
          </button>
        </nav>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Local workspace</p>
            <h1>Video Annotation & Export Tools</h1>
          </div>
          <button className="button secondary" onClick={loadData} type="button">Refresh</button>
        </header>

        {renderBreadcrumbs()}

        {error ? <div className="error-banner">{error}</div> : null}

        {renderContent()}
      </main>
    </div>
  );
}
