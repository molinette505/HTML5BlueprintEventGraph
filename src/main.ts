import "./js/DataTypes";
import "./js/Nodes";
import "./js/FunctionRegistry";

import { Editor } from "./js/Editor";

const preventBrowserZoom = () => {
  const preventGesture = (event: Event) => event.preventDefault();

  document.addEventListener("gesturestart", preventGesture, { passive: false });
  document.addEventListener("gesturechange", preventGesture, { passive: false });
  document.addEventListener("gestureend", preventGesture, { passive: false });

  document.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches.length > 1) {
        event.preventDefault();
      }
    },
    { passive: false }
  );
};

window.addEventListener("load", () => {
  preventBrowserZoom();
  window.App = new Editor();
});
