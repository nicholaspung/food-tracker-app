const KNOWN_ENVIRONMENTS = new Set(['local', 'beta', 'production']);

const state = {
  artifactRuns: [],
  baselineSelectionMode: 'auto',
  baselineSet: '',
  baselineSets: [],
  currentBaselinePayload: null,
  currentImageIndex: 0,
  currentRunPayload: null,
  defaultBaselineSet: 'current',
  envFilter: 'all',
  isDeletingRun: false,
  modalAction: null,
  selectedRun: null,
  viewMode: 'compare',
};

const elements = {
  actionModal: document.querySelector('#action-modal'),
  actionModalCancel: document.querySelector('#action-modal-cancel'),
  actionModalConfirm: document.querySelector('#action-modal-confirm'),
  actionModalInput: document.querySelector('#action-modal-input'),
  actionModalInputLabel: document.querySelector('#action-modal-input-label'),
  actionModalInputWrap: document.querySelector('#action-modal-input-wrap'),
  actionModalMessage: document.querySelector('#action-modal-message'),
  actionModalTitle: document.querySelector('#action-modal-title'),
  addBaselineButton: document.querySelector('#add-baseline-button'),
  baselineSetSelect: document.querySelector('#baseline-set-select'),
  carouselPosition: document.querySelector('#carousel-position'),
  currentRunTitle: document.querySelector('#current-run-title'),
  deleteRunButton: document.querySelector('#delete-run-button'),
  envFilterSelect: document.querySelector('#env-filter-select'),
  imageCardTemplate: document.querySelector('#image-card-template'),
  imageGrid: document.querySelector('#image-grid'),
  nextImageButton: document.querySelector('#next-image-button'),
  prevImageButton: document.querySelector('#prev-image-button'),
  refreshButton: document.querySelector('#refresh-button'),
  regressionAlert: document.querySelector('#regression-alert'),
  runCount: document.querySelector('#run-count'),
  runList: document.querySelector('#run-list'),
  selectedRunCard: document.querySelector('#selected-run-card'),
  selectedRunEnvironment: document.querySelector('#selected-run-environment'),
  selectedRunFlow: document.querySelector('#selected-run-flow'),
  selectedRunMeta: document.querySelector('#selected-run-meta'),
  selectedRunName: document.querySelector('#selected-run-name'),
  statusMessage: document.querySelector('#status-message'),
  viewModeButton: document.querySelector('#view-mode-button'),
};

function setStatus(message) {
  elements.statusMessage.textContent = message;
}

function normalizeBaselineSetName(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/^\/+|\/+$/g, '');
}

function normalizeRunEnvironment(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();
  return KNOWN_ENVIRONMENTS.has(normalizedValue) ? normalizedValue : null;
}

function getEnvironmentLabel(environment) {
  switch (environment) {
    case 'local':
      return 'Local';
    case 'beta':
      return 'Beta';
    case 'production':
      return 'Production';
    default:
      return 'Unclassified';
  }
}

function getEnvironmentTone(environment) {
  switch (environment) {
    case 'local':
      return 'info';
    case 'beta':
      return 'warning';
    case 'production':
      return 'success';
    default:
      return 'neutral';
  }
}

function getRunEnvironmentKey(run) {
  return normalizeRunEnvironment(run?.environment) ?? 'unknown';
}

function getVisibleArtifactRuns() {
  if (state.envFilter === 'all') {
    return state.artifactRuns;
  }

  return state.artifactRuns.filter((run) => getRunEnvironmentKey(run) === state.envFilter);
}

function getSelectedRunSummary() {
  return state.artifactRuns.find((run) => run.name === state.selectedRun) ?? null;
}

function ensureSelectedRunForCurrentFilter() {
  const visibleRuns = getVisibleArtifactRuns();

  if (!state.selectedRun && visibleRuns.length > 0) {
    state.selectedRun = visibleRuns[0].name;
    return;
  }

  if (state.selectedRun && !visibleRuns.some((run) => run.name === state.selectedRun)) {
    state.selectedRun = visibleRuns[0]?.name ?? null;
    state.currentImageIndex = 0;
  }
}

function syncAutoBaselineSetFromSelection() {
  if (state.baselineSelectionMode !== 'auto') {
    return;
  }

  const selectedRun = getSelectedRunSummary();
  state.baselineSet =
    (selectedRun?.preferredBaselineSet ?? selectedRun?.comparisonBaselineSet ?? state.baselineSet) ||
    state.defaultBaselineSet;
}

function buildOverviewUrl() {
  const params = new URLSearchParams();

  if (state.baselineSelectionMode === 'manual' && state.baselineSet) {
    params.set('baselineSet', state.baselineSet);
  }

  const queryString = params.toString();
  return queryString ? `/api/overview?${queryString}` : '/api/overview';
}

function buildRunUrl() {
  const params = new URLSearchParams();
  params.set('run', state.selectedRun);

  if (state.baselineSelectionMode === 'manual' && state.baselineSet) {
    params.set('baselineSet', state.baselineSet);
  }

  return `/api/run?${params.toString()}`;
}

function getCurrentImages() {
  return state.viewMode === 'baseline'
    ? state.currentBaselinePayload?.images ?? []
    : state.currentRunPayload?.images ?? [];
}

function getCurrentImage() {
  const images = getCurrentImages();
  return images[state.currentImageIndex] ?? null;
}

function clampCurrentImageIndex() {
  const images = getCurrentImages();
  if (images.length === 0) {
    state.currentImageIndex = 0;
    return;
  }

  state.currentImageIndex = Math.max(0, Math.min(state.currentImageIndex, images.length - 1));
}

function formatRunMeta(run) {
  const updatedAt = new Date(run.updatedAt);
  const updatedLabel = Number.isNaN(updatedAt.getTime()) ? run.updatedAt : updatedAt.toLocaleString();
  const reviewScreenshotCount = run.reviewScreenshotCount ?? run.expectedScreenshotCount ?? 0;
  const missingArtifactCount = run.missingArtifactCount ?? run.missingExpectedCount ?? 0;
  const countLabel = reviewScreenshotCount
    ? `${run.screenshotCount}/${reviewScreenshotCount} screenshots`
    : `${run.screenshotCount} screenshots`;
  const missingLabel = missingArtifactCount > 0 ? ` | ${missingArtifactCount} missing` : '';
  const unexpectedLabel = run.unexpectedCount > 0 ? ` | ${run.unexpectedCount} extra` : '';
  const baselineLabel = run.comparisonBaselineSet ? ` | baseline: ${run.comparisonBaselineSet}` : '';
  return `${countLabel}${missingLabel}${unexpectedLabel}${baselineLabel} | ${updatedLabel}`;
}

function formatFlowLabel(run) {
  const flowPaths = Array.isArray(run?.flowPaths)
    ? run.flowPaths
    : run?.flowPath
      ? [run.flowPath]
      : [];

  if (flowPaths.length === 0) {
    return '';
  }

  const flowNames = flowPaths.map((flowPath) => flowPath.split('/').pop()).join(', ');
  if (run.expectationSource === 'default_flow') {
    return `Expectations: ${flowNames} (fallback)`;
  }

  return flowPaths.length === 1 ? `Flow: ${flowNames}` : `Flows: ${flowNames}`;
}

function renderRegressionAlert(summary) {
  if (!summary || summary.missingArtifactCount === 0) {
    elements.regressionAlert.classList.add('is-hidden');
    elements.regressionAlert.textContent = '';
    return;
  }

  const missingLabel =
    summary.missingArtifactCount === 1
      ? '1 review screenshot is missing from this run.'
      : `${summary.missingArtifactCount} review screenshots are missing from this run.`;
  const baselineOnlyLabel =
    summary.baselineOnlyCount > 0
      ? ` Baseline adds ${summary.baselineOnlyCount} additional screenshot${summary.baselineOnlyCount === 1 ? '' : 's'} to review.`
      : '';
  elements.regressionAlert.classList.remove('is-hidden');
  elements.regressionAlert.textContent = `Regression alert: ${missingLabel}${baselineOnlyLabel}`;
}

function createStatusPill(label, tone) {
  const pill = document.createElement('span');
  pill.className = `status-pill status-pill-${tone}`;
  pill.textContent = label;
  return pill;
}

function createEnvironmentPill(environmentKey) {
  return createStatusPill(getEnvironmentLabel(environmentKey), getEnvironmentTone(environmentKey));
}

function renderSelectedRunPanel() {
  const selectedRun = getSelectedRunSummary();
  const hasSelectedRun = Boolean(selectedRun);

  elements.selectedRunCard.classList.toggle('is-empty', !hasSelectedRun);
  elements.deleteRunButton.disabled = !hasSelectedRun || state.isDeletingRun;
  elements.deleteRunButton.textContent = state.isDeletingRun ? 'Deleting...' : 'Delete';
  elements.selectedRunEnvironment.innerHTML = '';

  if (!selectedRun) {
    elements.selectedRunName.textContent = 'No run selected';
    elements.selectedRunMeta.textContent = 'Choose an artifact run to inspect it.';
    elements.selectedRunFlow.textContent = '';
    return;
  }

  elements.selectedRunName.textContent = selectedRun.name;
  elements.selectedRunMeta.textContent = formatRunMeta(selectedRun);
  elements.selectedRunEnvironment.append(createEnvironmentPill(getRunEnvironmentKey(selectedRun)));
  elements.selectedRunFlow.textContent = formatFlowLabel(selectedRun);
}

function updateViewModeButton() {
  elements.viewModeButton.textContent = state.viewMode === 'baseline' ? 'View Compare' : 'View Baselines';
}

function openActionModal(config) {
  state.modalAction = config.onConfirm;
  elements.actionModalTitle.textContent = config.title;
  elements.actionModalMessage.textContent = config.message;
  elements.actionModalConfirm.textContent = config.confirmLabel;
  elements.actionModalConfirm.className = config.confirmVariant === 'danger' ? 'danger-button' : 'primary-button';

  if (config.input) {
    elements.actionModalInputWrap.classList.remove('is-hidden');
    elements.actionModalInputLabel.textContent = config.input.label;
    elements.actionModalInput.value = config.input.initialValue ?? '';
    elements.actionModalInput.placeholder = config.input.placeholder ?? '';
  } else {
    elements.actionModalInputWrap.classList.add('is-hidden');
    elements.actionModalInput.value = '';
    elements.actionModalInput.placeholder = '';
  }

  elements.actionModal.classList.remove('is-hidden');

  if (config.input) {
    requestAnimationFrame(() => {
      elements.actionModalInput.focus();
      elements.actionModalInput.select();
    });
  }
}

function closeActionModal() {
  state.modalAction = null;
  elements.actionModal.classList.add('is-hidden');
}

async function submitActionModal() {
  if (!state.modalAction) {
    return;
  }

  const inputValue = elements.actionModalInput.value;
  await state.modalAction(inputValue);
}

function renderBaselineSetOptions() {
  const baselineOptions = new Set([state.defaultBaselineSet, ...state.baselineSets]);
  if (state.baselineSet) {
    baselineOptions.add(state.baselineSet);
  }

  const selectedBaselineSet = state.baselineSet || state.defaultBaselineSet;
  const optionValues = [...baselineOptions].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );

  elements.baselineSetSelect.innerHTML = '';
  for (const optionValue of optionValues) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionValue;
    option.selected = optionValue === selectedBaselineSet;
    elements.baselineSetSelect.append(option);
  }
}

function renderRunList() {
  const visibleRuns = getVisibleArtifactRuns();

  elements.runList.innerHTML = '';
  elements.runCount.textContent =
    state.envFilter === 'all'
      ? `${visibleRuns.length} runs`
      : `${visibleRuns.length} of ${state.artifactRuns.length} runs`;

  if (visibleRuns.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'meta';
    empty.textContent =
      state.artifactRuns.length === 0
        ? 'No artifact runs found.'
        : 'No artifact runs match the selected environment filter.';
    elements.runList.append(empty);
    renderSelectedRunPanel();
    return;
  }

  for (const run of visibleRuns) {
    const button = document.createElement('button');
    const header = document.createElement('div');
    const name = document.createElement('span');
    const meta = document.createElement('span');

    button.type = 'button';
    button.className = `run-button${run.name === state.selectedRun ? ' active' : ''}`;
    header.className = 'run-button-header';
    name.className = 'run-button-name';
    meta.className = 'run-button-meta';

    name.textContent = run.name;
    meta.textContent = formatRunMeta(run);
    header.append(name, createEnvironmentPill(getRunEnvironmentKey(run)));
    button.append(header, meta);

    button.addEventListener('click', () => {
      state.selectedRun = run.name;
      state.currentImageIndex = 0;
      syncAutoBaselineSetFromSelection();
      renderBaselineSetOptions();
      renderRunList();
      void loadCurrentView().catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Could not load run.');
      });
    });

    elements.runList.append(button);
  }

  renderSelectedRunPanel();
}

function updateCarouselControls() {
  const images = getCurrentImages();
  const currentCount = images.length;
  const currentIndexLabel = currentCount === 0 ? 0 : state.currentImageIndex + 1;

  elements.carouselPosition.textContent = `${currentIndexLabel} of ${currentCount}`;
  elements.prevImageButton.disabled = currentCount === 0 || state.currentImageIndex === 0;
  elements.nextImageButton.disabled = currentCount === 0 || state.currentImageIndex >= currentCount - 1;
}

function createImageCard(image) {
  const isBaselineMode = state.viewMode === 'baseline';
  const fragment = elements.imageCardTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.image-card');
  const comparisonGrid = fragment.querySelector('.comparison-grid');
  const imageCardHeader = fragment.querySelector('.image-card-header');
  const imageName = fragment.querySelector('.image-name');
  const artifactPanel = fragment.querySelector('.artifact-panel');
  const artifactWrap = fragment.querySelector('.artifact-wrap');
  const artifactImage = fragment.querySelector('.artifact-image');
  const baselinePanel = fragment.querySelector('.baseline-panel');
  const baselineWrap = fragment.querySelector('.baseline-wrap');
  const baselineImage = fragment.querySelector('.baseline-image');
  const baselineEmptyState = baselinePanel.querySelector('.empty-state');
  const artifactEmptyState = fragment.querySelector('.artifact-empty-state');
  const promoteButton = fragment.querySelector('.promote-button');
  const flags = document.createElement('div');

  imageName.textContent = image.name;
  flags.className = 'image-flags';

  if (isBaselineMode) {
    card.classList.add('image-card-baseline-mode');
    artifactPanel.remove();
    promoteButton.remove();
    comparisonGrid.classList.add('baseline-only-grid');
    baselinePanel.querySelector('h4').textContent = 'Baseline';
    baselineEmptyState.textContent = 'No baseline image in this set yet.';
  }

  if (!isBaselineMode && image.artifactMissing) {
    artifactWrap.classList.add('is-empty');
    artifactEmptyState.textContent = 'Review screenshot missing from artifact run.';
    flags.append(createStatusPill('Missing Artifact', 'danger'));
    card.classList.add('image-card-regression');
  } else if (!isBaselineMode && image.isUnexpected) {
    flags.append(createStatusPill('Unexpected Artifact', 'warning'));
  }

  if (!isBaselineMode && image.isBaselineOnly) {
    flags.append(createStatusPill('Baseline Only', 'neutral'));
  }

  if (!isBaselineMode && image.artifactUrl) {
    artifactImage.alt = `${image.name} artifact`;
    artifactImage.src = `${image.artifactUrl}?t=${Date.now()}`;
  } else if (!isBaselineMode) {
    artifactWrap.classList.add('is-empty');
  }

  if (image.baselineUrl) {
    baselineImage.alt = `${image.name} baseline`;
    baselineImage.src = `${image.baselineUrl}?t=${Date.now()}`;
  } else {
    baselineWrap.classList.add('is-empty');
    if (!isBaselineMode) {
      flags.append(createStatusPill('No Baseline', 'neutral'));
    }
  }

  if (flags.childElementCount > 0) {
    if (isBaselineMode) {
      imageCardHeader.append(flags);
    } else {
      imageCardHeader.insertBefore(flags, promoteButton);
    }
  }

  if (isBaselineMode) {
    return card;
  }

  if (!image.hasArtifact) {
    promoteButton.disabled = true;
    promoteButton.textContent = 'Missing Artifact';
    return card;
  }

  promoteButton.addEventListener('click', async () => {
    promoteButton.disabled = true;
    promoteButton.textContent = 'Moving...';

    try {
      const response = await fetch('/api/promote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          baselineSet: state.baselineSet,
          filename: image.name,
          run: state.selectedRun,
        }),
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || 'Could not move image.');
      }

      setStatus(`Moved ${image.name} to baselines/${state.baselineSet}/`);
      await refreshOverview();
      await loadRun({ focusImageName: image.name });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not move image.');
      promoteButton.disabled = false;
      promoteButton.textContent = 'Move To Baseline';
    }
  });

  return card;
}

function renderCurrentImageCard() {
  elements.imageGrid.innerHTML = '';
  clampCurrentImageIndex();
  updateCarouselControls();

  const currentImage = getCurrentImage();
  if (!currentImage) {
    return;
  }

  elements.imageGrid.append(createImageCard(currentImage));
}

function openDeleteModal() {
  const selectedRun = getSelectedRunSummary();
  if (!selectedRun) {
    return;
  }

  openActionModal({
    title: 'Delete artifact run?',
    message: `Delete ${selectedRun.name}? This removes the artifact folder and all screenshots in it.`,
    confirmLabel: 'Delete Run',
    confirmVariant: 'danger',
    onConfirm: async () => {
      await deleteSelectedRun();
    },
  });
}

async function deleteSelectedRun() {
  const selectedRun = getSelectedRunSummary();
  if (!selectedRun || state.isDeletingRun) {
    return;
  }

  state.isDeletingRun = true;
  renderSelectedRunPanel();

  try {
    const response = await fetch(`/api/run?run=${encodeURIComponent(selectedRun.name)}`, {
      method: 'DELETE',
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'Could not delete artifact run.');
    }

    closeActionModal();
    setStatus(`Deleted artifact run ${selectedRun.name}.`);
    await refreshOverview();
    await loadCurrentView();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Could not delete artifact run.');
  } finally {
    state.isDeletingRun = false;
    renderSelectedRunPanel();
  }
}

async function loadRun(options = {}) {
  if (!state.selectedRun) {
    state.currentRunPayload = null;
    state.currentImageIndex = 0;
    elements.currentRunTitle.textContent = 'Select a run';
    elements.imageGrid.innerHTML = '';
    renderRegressionAlert(null);
    updateCarouselControls();
    setStatus('Waiting for artifact selection.');
    return;
  }

  setStatus(`Loading ${state.selectedRun}...`);

  const response = await fetch(buildRunUrl());
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || 'Could not load run.');
  }

  state.currentRunPayload = payload;
  state.currentBaselinePayload = null;
  state.baselineSet = payload.baselineSet || state.baselineSet || state.defaultBaselineSet;
  renderBaselineSetOptions();
  elements.currentRunTitle.textContent = `${payload.run} -> baselines/${payload.baselineSet}`;
  renderRegressionAlert(payload.summary);

  if (payload.images.length === 0) {
    state.currentImageIndex = 0;
    elements.imageGrid.innerHTML = '';
    updateCarouselControls();
    setStatus('No screenshots are available for this artifact run yet.');
    return;
  }

  if (options.focusImageName) {
    const nextImageIndex = payload.images.findIndex((image) => image.name === options.focusImageName);
    state.currentImageIndex = nextImageIndex >= 0 ? nextImageIndex : 0;
  } else {
    clampCurrentImageIndex();
  }

  renderCurrentImageCard();

  if (payload.summary.comparisonCount > 0) {
    const missingLabel =
      payload.summary.missingArtifactCount > 0
        ? ` ${payload.summary.missingArtifactCount} missing from artifact run.`
        : '';
    const unexpectedLabel =
      payload.summary.unexpectedCount > 0
        ? ` ${payload.summary.unexpectedCount} unexpected extra.`
        : '';
    const baselineOnlyLabel =
      payload.summary.baselineOnlyCount > 0
        ? ` Baseline adds ${payload.summary.baselineOnlyCount} additional review screenshot${payload.summary.baselineOnlyCount === 1 ? '' : 's'}.`
        : '';
    setStatus(
      `Loaded ${payload.summary.actualCount} of ${payload.summary.comparisonCount} review screenshots.${missingLabel}${unexpectedLabel}${baselineOnlyLabel}`.trim(),
    );
    return;
  }

  setStatus(`Loaded ${payload.images.length} screenshots.`);
}

async function loadBaselineImages(options = {}) {
  if (!state.baselineSet) {
    state.baselineSet = state.defaultBaselineSet;
    renderBaselineSetOptions();
  }

  setStatus(`Loading baselines/${state.baselineSet}...`);

  const response = await fetch(`/api/baselines?baselineSet=${encodeURIComponent(state.baselineSet)}`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || 'Could not load baselines.');
  }

  state.currentBaselinePayload = payload;
  state.currentRunPayload = null;
  state.baselineSet = payload.baselineSet || state.baselineSet;
  renderBaselineSetOptions();
  elements.currentRunTitle.textContent = `Baselines/${payload.baselineSet}`;
  renderRegressionAlert(null);

  if (payload.images.length === 0) {
    state.currentImageIndex = 0;
    elements.imageGrid.innerHTML = '';
    updateCarouselControls();
    setStatus(`No baseline screenshots are available in baselines/${payload.baselineSet}.`);
    return;
  }

  if (options.focusImageName) {
    const nextImageIndex = payload.images.findIndex((image) => image.name === options.focusImageName);
    state.currentImageIndex = nextImageIndex >= 0 ? nextImageIndex : 0;
  } else {
    clampCurrentImageIndex();
  }

  renderCurrentImageCard();
  setStatus(`Loaded ${payload.summary.baselineCount} baseline screenshot${payload.summary.baselineCount === 1 ? '' : 's'}.`);
}

async function refreshOverview() {
  const response = await fetch(buildOverviewUrl());
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || 'Could not load overview.');
  }

  state.artifactRuns = payload.artifactRuns;
  state.baselineSets = payload.baselineSets;
  state.defaultBaselineSet = payload.defaultBaselineSet || 'current';
  ensureSelectedRunForCurrentFilter();
  syncAutoBaselineSetFromSelection();
  renderBaselineSetOptions();
  renderRunList();
}

async function loadCurrentView(options = {}) {
  if (state.viewMode === 'baseline') {
    await loadBaselineImages(options);
    return;
  }

  await loadRun(options);
}

async function toggleViewMode() {
  state.viewMode = state.viewMode === 'baseline' ? 'compare' : 'baseline';
  state.currentImageIndex = 0;
  updateViewModeButton();
  await loadCurrentView();
}

function showPreviousImage() {
  if (state.currentImageIndex <= 0) {
    return;
  }

  state.currentImageIndex -= 1;
  renderCurrentImageCard();
}

function showNextImage() {
  const images = getCurrentImages();
  if (state.currentImageIndex >= images.length - 1) {
    return;
  }

  state.currentImageIndex += 1;
  renderCurrentImageCard();
}

async function bootstrap() {
  updateViewModeButton();

  elements.baselineSetSelect.addEventListener('change', () => {
    const nextValue = normalizeBaselineSetName(elements.baselineSetSelect.value);
    if (!nextValue) {
      renderBaselineSetOptions();
      return;
    }

    state.baselineSelectionMode = 'manual';
    state.baselineSet = nextValue;
    void (async () => {
      await refreshOverview();
      await loadCurrentView();
    })().catch((error) => {
      setStatus(error instanceof Error ? error.message : 'Could not load run.');
    });
  });

  elements.envFilterSelect.addEventListener('change', () => {
    state.envFilter = elements.envFilterSelect.value;
    state.currentImageIndex = 0;
    ensureSelectedRunForCurrentFilter();
    syncAutoBaselineSetFromSelection();
    renderBaselineSetOptions();
    renderRunList();
    void loadCurrentView().catch((error) => {
      setStatus(error instanceof Error ? error.message : 'Could not load run.');
    });
  });

  elements.addBaselineButton.addEventListener('click', () => {
    openActionModal({
      title: 'Add baseline set',
      message: 'Choose a folder name for screenshots you want to promote into a new baseline set.',
      confirmLabel: 'Save Baseline Set',
      confirmVariant: 'primary',
      input: {
        label: 'Baseline folder name',
        initialValue: state.baselineSet || state.defaultBaselineSet,
        placeholder: state.defaultBaselineSet,
      },
      onConfirm: async (inputValue) => {
        const nextValue = normalizeBaselineSetName(inputValue);
        if (!nextValue) {
          setStatus('Baseline set name is required.');
          return;
        }

        if (!state.baselineSets.includes(nextValue)) {
          state.baselineSets.push(nextValue);
          state.baselineSets.sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
        }

        state.baselineSelectionMode = 'manual';
        state.baselineSet = nextValue;
        renderBaselineSetOptions();
        closeActionModal();
        try {
          await refreshOverview();
          await loadCurrentView();
        } catch (error) {
          setStatus(error instanceof Error ? error.message : 'Could not load run.');
        }
      },
    });
  });

  elements.refreshButton.addEventListener('click', () => {
    void (async () => {
      setStatus('Refreshing...');
      await refreshOverview();
      await loadCurrentView();
    })().catch((error) => {
      setStatus(error instanceof Error ? error.message : 'Could not refresh review UI.');
    });
  });

  elements.viewModeButton.addEventListener('click', () => {
    void toggleViewMode().catch((error) => {
      setStatus(error instanceof Error ? error.message : 'Could not switch review mode.');
    });
  });

  elements.prevImageButton.addEventListener('click', showPreviousImage);
  elements.nextImageButton.addEventListener('click', showNextImage);

  elements.deleteRunButton.addEventListener('click', openDeleteModal);
  elements.actionModalCancel.addEventListener('click', closeActionModal);
  elements.actionModal.addEventListener('click', (event) => {
    if (event.target === elements.actionModal) {
      closeActionModal();
    }
  });
  elements.actionModalConfirm.addEventListener('click', () => {
    void submitActionModal();
  });
  elements.actionModalInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submitActionModal();
    }
  });

  try {
    await refreshOverview();
    await loadCurrentView();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Could not load review UI.');
  }
}

void bootstrap();
