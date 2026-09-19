"use client";

import { useState } from "react";

const agents = [
  {
    name: "Atlas",
    model: "Claude 4.1 Opus",
    task: "Refactor auth middleware",
    status: "Working",
    tone: "violet",
    progress: 72,
    branch: "agent/atlas-auth",
  },
  {
    name: "Mosaic",
    model: "Codex 5",
    task: "Ship billing settings",
    status: "Review ready",
    tone: "orange",
    progress: 100,
    branch: "agent/mosaic-billing",
  },
  {
    name: "Scout",
    model: "Gemini 2.5 Pro",
    task: "Threat model API surface",
    status: "Working",
    tone: "mint",
    progress: 48,
    branch: "agent/scout-threat-model",
  },
];

const files = [
  ["src", "folder"],
  ["auth", "folder"],
  ["middleware.ts", "file"],
  ["security.config.ts", "file"],
  ["billing", "folder"],
  ["settings.tsx", "file"],
  ["tests", "folder"],
];

export default function Home() {
  const [activeAgent, setActiveAgent] = useState("Atlas");
  const [prompt, setPrompt] = useState("");
  const [sent, setSent] = useState(false);

  function runPrompt() {
    if (!prompt.trim()) return;
    setSent(true);
    setPrompt("");
    window.setTimeout(() => setSent(false), 2600);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">A</span>
          <span>arcade</span>
          <span className="beta">beta</span>
        </div>
        <div className="workspace-label">Workspace</div>
        <button className="workspace-switcher">
          <span className="repo-icon">/</span>
          <span>
            <strong>acme-platform</strong>
            <small>main</small>
          </span>
          <span className="chevron">v</span>
        </button>
        <nav className="nav-list" aria-label="Primary navigation">
          <button className="nav-item active">
            <span className="nav-icon">+</span>Command center
            <span className="nav-count">3</span>
          </button>
          <button className="nav-item">
            <span className="nav-icon">[]</span>Worktrees
          </button>
          <button className="nav-item">
            <span className="nav-icon">~</span>Terminal
          </button>
          <button className="nav-item">
            <span className="nav-icon">#</span>Session search
          </button>
          <button className="nav-item">
            <span className="nav-icon">*</span>Security
          </button>
        </nav>
        <div className="sidebar-section">
          <div className="section-title">
            Active worktrees <span>+</span>
          </div>
          {agents.map((agent) => (
            <button
              key={agent.name}
              className={`tree-item ${activeAgent === agent.name ? "selected" : ""}`}
              onClick={() => setActiveAgent(agent.name)}
            >
              <span className={`status-dot ${agent.tone}`} />
              <span>{agent.name}</span>
              <small>
                {agent.status === "Review ready" ? "ready" : "working"}
              </small>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="secure-badge">
            <span className="shield">+</span>
            <span>
              <strong>Protected workspace</strong>
              <small>Policy checks on</small>
            </span>
            <span className="online-dot" />
          </div>
          <button className="profile">
            <span className="avatar">AK</span>
            <span>
              <strong>Alex Kim</strong>
              <small>Personal workspace</small>
            </span>
            <span className="chevron">v</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>acme-platform</span>
            <span>/</span>
            <strong>Command center</strong>
          </div>
          <div className="top-actions">
            <span className="sync-status">
              <span className="online-dot" /> Synced 12s ago
            </span>
            <button className="icon-button" aria-label="Search">
              /
            </button>
            <button className="icon-button" aria-label="Notifications">
              *
            </button>
            <button className="help-button">?</button>
          </div>
        </header>

        <div className="content-wrap">
          <section className="hero-row">
            <div>
              <p className="eyebrow">
                MONDAY, SEPTEMBER 20 <span className="eyebrow-line" />
              </p>
              <h1>Good morning, Alex.</h1>
              <p className="hero-copy">
                Three agents are moving your release forward. Review their work
                or spin up another.
              </p>
            </div>
            <button
              className="primary-button"
              onClick={() => document.getElementById("prompt")?.focus()}
            >
              <span>+</span> Start an agent
            </button>
          </section>

          <section className="metrics-grid">
            <div className="metric-card">
              <span className="metric-label">Agents in flight</span>
              <strong>03</strong>
              <span className="metric-note positive">+2 since yesterday</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Tasks shipped</span>
              <strong>18</strong>
              <span className="metric-note">this week</span>
            </div>
            <div className="metric-card accent-metric">
              <span className="metric-label">Security posture</span>
              <strong>
                98<span className="metric-unit">/100</span>
              </strong>
              <span className="metric-note positive">
                All systems protected
              </span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Tokens saved</span>
              <strong>
                2.4<span className="metric-unit">M</span>
              </strong>
              <span className="metric-note">via shared context</span>
            </div>
          </section>

          <section className="section-block">
            <div className="section-heading">
              <div>
                <h2>Agent activity</h2>
                <p>Every agent works in an isolated worktree.</p>
              </div>
              <button className="text-button">
                View all <span>-&gt;</span>
              </button>
            </div>
            <div className="agent-grid">
              {agents.map((agent) => (
                <article
                  className={`agent-card ${activeAgent === agent.name ? "focused" : ""}`}
                  key={agent.name}
                  onClick={() => setActiveAgent(agent.name)}
                >
                  <div className="agent-card-top">
                    <div className={`agent-avatar ${agent.tone}`}>
                      {agent.name.slice(0, 1)}
                    </div>
                    <div>
                      <h3>{agent.name}</h3>
                      <span>{agent.model}</span>
                    </div>
                    <button
                      className="more-button"
                      aria-label={`More options for ${agent.name}`}
                    >
                      ...
                    </button>
                  </div>
                  <div className="task-copy">
                    <span
                      className={`live-label ${agent.status === "Review ready" ? "ready" : ""}`}
                    >
                      <span />
                      {agent.status}
                    </span>
                    <p>{agent.task}</p>
                  </div>
                  <div className="progress-track">
                    <span style={{ width: `${agent.progress}%` }} />
                  </div>
                  <div className="card-footer">
                    <code>{agent.branch}</code>
                    <span>{agent.progress}%</span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <div className="lower-grid">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Security center</h2>
                  <p>Guardrails are active across every agent.</p>
                </div>
                <span className="health-pill">
                  <span /> Healthy
                </span>
              </div>
              <div className="security-list">
                <div>
                  <span className="check-mark">+</span>
                  <span>
                    <strong>Prompt injection shield</strong>
                    <small>Active on all incoming context</small>
                  </span>
                  <b>ON</b>
                </div>
                <div>
                  <span className="check-mark">+</span>
                  <span>
                    <strong>Secrets scanner</strong>
                    <small>No exposed credentials detected</small>
                  </span>
                  <b>ON</b>
                </div>
                <div>
                  <span className="check-mark">+</span>
                  <span>
                    <strong>Worktree isolation</strong>
                    <small>3 sandboxes enforced</small>
                  </span>
                  <b>ON</b>
                </div>
              </div>
              <button className="panel-link">
                Open security policy <span>-&gt;</span>
              </button>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Recent activity</h2>
                  <p>Across your workspace</p>
                </div>
                <button className="filter-button">All v</button>
              </div>
              <div className="activity-list">
                <div>
                  <span className="activity-icon mint">+</span>
                  <span>
                    <strong>Mosaic opened a review</strong>
                    <small>billing/settings.tsx</small>
                  </span>
                  <time>2m</time>
                </div>
                <div>
                  <span className="activity-icon violet">+</span>
                  <span>
                    <strong>Atlas found 4 related sessions</strong>
                    <small>auth middleware refactor</small>
                  </span>
                  <time>18m</time>
                </div>
                <div>
                  <span className="activity-icon orange">+</span>
                  <span>
                    <strong>Scout passed threat model</strong>
                    <small>API surface / v2</small>
                  </span>
                  <time>41m</time>
                </div>
              </div>
              <button className="panel-link">
                See activity log <span>-&gt;</span>
              </button>
            </section>
          </div>

          <section className="prompt-bar">
            <div className="prompt-heading">
              <span className="prompt-spark">*</span>
              <div>
                <strong>What should your agents build?</strong>
                <span>
                  Describe a task and Arcade will route it to the best model.
                </span>
              </div>
            </div>
            <div className="prompt-input-wrap">
              <input
                id="prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") runPrompt();
                }}
                placeholder="e.g. Add rate limiting to the public API..."
              />
              <button
                className="send-button"
                onClick={runPrompt}
                aria-label="Send task"
              >
                -&gt;
              </button>
            </div>
            {sent && (
              <span className="sent-message">
                Task queued in a new isolated worktree.
              </span>
            )}
          </section>

          <section className="files-section">
            <div className="section-heading">
              <div>
                <h2>Project explorer</h2>
                <p>acme-platform / main</p>
              </div>
              <button className="text-button">
                Open editor <span>-&gt;</span>
              </button>
            </div>
            <div className="file-strip">
              {files.map(([name, type]) => (
                <button key={name} className="file-item">
                  <span
                    className={type === "folder" ? "folder-icon" : "file-icon"}
                  >
                    {type === "folder" ? "+" : ""}
                  </span>
                  {name}
                </button>
              ))}
              <button className="file-item more-files">+ 24 more</button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
