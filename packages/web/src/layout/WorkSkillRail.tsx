import { NavLink } from "react-router-dom";

import {
  afWorkSkillIds,
  afWorkSkillLabels,
  type AfWorkItemManifest,
  type AfWorkSkillId,
} from "../analyzer/afWorkItem";

const routeBySkill: Record<AfWorkSkillId, string> = {
  "af-discover-assets": "discover",
  "af-compose-solution": "compose",
  "af-scaffold-runtime": "scaffold",
  "af-verify-runtime": "verify",
};

export function WorkSkillRail({ workId, manifest }: { workId: string; manifest: AfWorkItemManifest | null }) {
  return (
    <aside className="work-skill-rail" aria-label="Agent Factory Work Skills">
      <div className="work-skill-rail-heading">
        <span>Work Skills</span>
        <strong>실행 구조</strong>
      </div>
      <nav>
        {afWorkSkillIds.map((skillId, index) => {
          const state = manifest?.skills[skillId];
          const blocked = prerequisiteBlocked(skillId, manifest);
          return (
            <NavLink
              key={skillId}
              to={`/work/${encodeURIComponent(workId)}/${routeBySkill[skillId]}`}
              className={({ isActive }) => `work-skill-link${isActive ? " is-active" : ""}${blocked ? " is-blocked" : ""}`}
            >
              <span className="work-skill-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="work-skill-copy">
                <strong>{afWorkSkillLabels[skillId].short}</strong>
                <small>{skillId}</small>
              </span>
              <span className={`work-status-dot is-${state?.status ?? "not_started"}`} aria-label={state?.status ?? "not_started"} />
            </NavLink>
          );
        })}
      </nav>
      <div className="work-skill-legend">
        <span><i className="work-status-dot is-active" /> 진행</span>
        <span><i className="work-status-dot is-waiting_for_review" /> 검토</span>
        <span><i className="work-status-dot is-complete" /> 완료</span>
      </div>
    </aside>
  );
}

function prerequisiteBlocked(skillId: AfWorkSkillId, manifest: AfWorkItemManifest | null): boolean {
  if (!manifest || skillId === "af-discover-assets") return false;
  if (skillId === "af-compose-solution") return manifest.review_gates.discovery.status !== "approved";
  return manifest.review_gates.composition.status !== "approved";
}
