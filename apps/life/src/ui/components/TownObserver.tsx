import { useState } from "react";
import type { StoryView } from "../models/storyView.js";
import { residentInitials } from "../models/residentView.js";
import { TownMiniMap } from "./TownMiniMap.js";

interface TownObserverProps {
  live: readonly StoryView[];
  town: readonly StoryView[];
  following: readonly StoryView[];
  names: ReadonlyMap<string, string>;
  followedCount: number;
  currentLocationId?: string;
  selectedLocationId?: string;
  onOpenMap(): void;
  onClose(): void;
}

type ObserverTab = "live" | "town" | "following" | "map";

export function TownObserver(props: TownObserverProps) {
  const [tab, setTab] = useState<ObserverTab>("live");
  const stories = tab === "town" ? props.town : tab === "following" ? props.following : props.live;
  return (
    <aside className="side-panel town-observer" aria-label="Town Observer">
      <div className="side-panel__top">
        <span><small>What has been happening?</small><strong>Town Observer</strong></span>
        <button type="button" className="icon-button" onClick={props.onClose}
          aria-label="Close Town Observer">×</button>
      </div>
      <nav className="panel-tabs" aria-label="Town Observer sections">
        {(["live", "town", "following", "map"] as const).map((value) => (
          <button type="button" key={value} className={tab === value ? "is-active" : ""}
            onClick={() => setTab(value)}>
            {value[0]!.toUpperCase() + value.slice(1)}
          </button>
        ))}
      </nav>
      <div className="side-panel__scroll story-feed">
        {tab === "map" ? (
          <div className="observer-map-callout">
            <TownMiniMap currentLocationId={props.currentLocationId}
              selectedLocationId={props.selectedLocationId} />
            <strong>See where life is unfolding</strong>
            <p>See residents, open venues and where your next trip is headed.</p>
            <button type="button" className="primary-button" onClick={props.onOpenMap}>Open town map</button>
          </div>
        ) : stories.length === 0 ? (
          <p className="empty-state">
            {tab === "following" && props.followedCount === 0
              ? "Follow a resident from their profile to collect their visible town moments here."
              : tab === "town"
                ? "No visible town stories yet. Give the simulation a little time."
                : "No recent observer-worthy activity yet."}
          </p>
        ) : stories.map((story) => (
          <article className={`story-item story-item--${story.tone}`} key={story.id}>
            <span className="story-item__mark" aria-hidden="true" />
            <div>
              <p>{story.text}</p>
              <footer>
                <small>{story.when}</small>
                {story.participants.length > 0 && (
                  <span className="participant-stack" aria-label="Story participants">
                    {story.participants.slice(0, 3).map((id) => (
                      <i key={id} title={props.names.get(id) ?? id}>
                        {residentInitials(props.names.get(id) ?? id)}
                      </i>
                    ))}
                  </span>
                )}
              </footer>
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
}
