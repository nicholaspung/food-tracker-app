const state = {
  artifactRuns: [],
  baselineSets: [],
  selectedRun: null,
  baselineSet: 'current',
};

const elements = {
  baselineSetInput: document.querySelector('#baseline-set-input'),
  currentRunTitle: document.querySelector('#current-run-title'),
  imageCardTemplate: document.querySelector('#image-card-template'),
  imageGrid: document.querySelector('#image-grid'),
  refreshButton: document.querySelector('#refresh-button'),
  runCount: document.querySelector('#run-count'),
  runList: document.querySelector('#run-list'),
  statusMessage: document.querySelector('#status-message'),
};

function setStatus(message) {
  elements.statusMessage.textContent = message;
}

function formatRunMeta(run) {
  const updatedAt = new Date(run.updatedAt);
  const updatedLabel = Number.isNaN(updatedAt.getTime()) ? run.updatedAt : updatedAt.toLocaleString();
  return `${run.screenshotCount} screenshots | ${updatedLabel}`;
}

function renderRunList() {
  elements.runList.innerHTML = '';
  elements.runCount.textContent = `${state.artifactRuns.length} runs`;

  if (state.artifactRuns.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'meta';
    empty.textContent = 'No artifact runs found.';
    elements.runList.append(empty);
    return;
  }

  for (const run of state.artifactRuns) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `run-button${run.name === state.selectedRun ? ' active' : ''}`;
    button.innerHTML = `
      <span class="run-button-name">${run.name}</span>
      <span class="run-button-meta">${formatRunMeta(run)}</span>
    `;
    button.addEventListener('click', () => {
      state.selectedRun = run.name;
      renderRunList();
      void loadRun();
    });
    elements.runList.append(button);
  }
}

function createImageCard(image) {
  const fragment = elements.imageCardTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.image-card');
  const imageName = fragment.querySelector('.image-name');
  const artifactImage = fragment.querySelector('.artifact-image');
  const baselineImage = fragment.querySelector('.baseline-image');
  const baselineWrap = fragment.querySelector('.baseline-wrap');
  const promoteButton = fragment.querySelector('.promote-button');

  imageName.textContent = image.name;
  artifactImage.alt = `${image.name} artifact`;
  artifactImage.src = `${image.artifactUrl}?t=${Date.now()}`;

  if (image.baselineUrl) {
    baselineImage.alt = `${image.name} baseline`;
    baselineImage.src = `${image.baselineUrl}?t=${Date.now()}`;
  } else {
    baselineWrap.classList.add('is-empty');
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
      await loadRun();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not move image.');
      promoteButton.disabled = false;
      promoteButton.textContent = 'Move To Baseline';
    }
  });

  return card;
}

async function loadRun() {
  if (!state.selectedRun) {
    elements.currentRunTitle.textContent = 'Select a run';
    elements.imageGrid.innerHTML = '';
    setStatus('Waiting for artifact selection.');
    return;
  }

  setStatus(`Loading ${state.selectedRun}...`);

  const response = await fetch(
    `/api/run?run=${encodeURIComponent(state.selectedRun)}&baselineSet=${encodeURIComponent(state.baselineSet)}`,
  );
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || 'Could not load run.');
  }

  elements.currentRunTitle.textContent = `${payload.run} -> baselines/${payload.baselineSet}`;
  elements.imageGrid.innerHTML = '';

  if (payload.images.length === 0) {
    setStatus('No screenshots remain in this artifact run.');
    return;
  }

  for (const image of payload.images) {
    elements.imageGrid.append(createImageCard(image));
  }

  setStatus(`Loaded ${payload.images.length} screenshots.`);
}

async function refreshOverview() {
  const response = await fetch('/api/overview');
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || 'Could not load overview.');
  }

  state.artifactRuns = payload.artifactRuns;
  state.baselineSets = payload.baselineSets;
  if (!state.baselineSet) {
    state.baselineSet = payload.defaultBaselineSet;
  }

  if (!state.selectedRun && state.artifactRuns.length > 0) {
    state.selectedRun = state.artifactRuns[0].name;
  }

  if (state.selectedRun && !state.artifactRuns.some((run) => run.name === state.selectedRun)) {
    state.selectedRun = state.artifactRuns[0]?.name ?? null;
  }

  elements.baselineSetInput.value = state.baselineSet;
  renderRunList();
}

async function bootstrap() {
  elements.baselineSetInput.addEventListener('change', () => {
    const nextValue = elements.baselineSetInput.value.trim();
    if (!nextValue) {
      elements.baselineSetInput.value = state.baselineSet;
      return;
    }

    state.baselineSet = nextValue;
    void loadRun().catch((error) => {
      setStatus(error instanceof Error ? error.message : 'Could not load run.');
    });
  });

  elements.refreshButton.addEventListener('click', () => {
    void (async () => {
      setStatus('Refreshing...');
      await refreshOverview();
      await loadRun();
    })().catch((error) => {
      setStatus(error instanceof Error ? error.message : 'Could not refresh review UI.');
    });
  });

  try {
    await refreshOverview();
    await loadRun();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Could not load review UI.');
  }
}

void bootstrap();
