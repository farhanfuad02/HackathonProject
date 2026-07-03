/**
 * Tiny API layer so components don't care which data source is active.
 *
 * Live builds POST to the backend; demo builds (GitHub Pages, no
 * backend) apply the same action to the in-browser simulator.
 */

import { toggleDemoDevice } from "./demo/demoSim.js";

const DEMO = import.meta.env.VITE_DEMO === "true";

export function toggleDevice(id) {
  if (DEMO) {
    toggleDemoDevice(id);
    return;
  }
  fetch(`/api/devices/${id}/toggle`, { method: "POST" }).catch(() => {});
}
