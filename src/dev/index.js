/**
 * Dev harness entry (plan #20). A single-page Storybook-style runner
 * for iterating on UI modules against fixture state without booting the
 * full app.
 *
 * Stories live in src/dev/stories/*.js. Each exports:
 *   - title: string
 *   - description: string
 *   - render(stage, setState): void
 *
 * `setState` lets a story mirror its current value into #state-dump so
 * you can watch a form's value object change as you type.
 *
 * Routing: the active story id rides on `location.hash`, so reloading
 * keeps you on the same story. Plain hash routing — no router lib.
 */

import { schemaFormStories } from './stories/schema-form.js';

const stories = [...schemaFormStories];

function renderSidebar() {
  const list = document.getElementById('story-list');
  list.innerHTML = '';
  for (const story of stories) {
    const btn = document.createElement('button');
    btn.textContent = story.title;
    btn.dataset.id = story.id;
    btn.addEventListener('click', () => navigateTo(story.id));
    list.appendChild(btn);
  }
}

function navigateTo(id) {
  location.hash = id;
}

function activateFromHash() {
  const id = location.hash.replace(/^#/, '') || stories[0]?.id;
  if (!id) return;
  const story = stories.find((s) => s.id === id);
  if (!story) return;
  // Active button highlight
  for (const btn of document.querySelectorAll('aside button')) {
    btn.classList.toggle('active', btn.dataset.id === id);
  }
  document.getElementById('story-title').textContent = story.title;
  document.getElementById('story-desc').textContent = story.description;
  const stage = document.getElementById('stage');
  stage.innerHTML = '';
  const setState = (state) => {
    document.getElementById('state-dump').textContent = JSON.stringify(state, null, 2);
  };
  setState({});
  try {
    story.render(stage, setState);
  } catch (e) {
    stage.innerHTML = `<pre style="color:#f85149">Story crashed:\n${e.stack || e.message}</pre>`;
  }
}

renderSidebar();
window.addEventListener('hashchange', activateFromHash);
activateFromHash();
