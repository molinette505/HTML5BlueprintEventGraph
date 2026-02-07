import "./js/DataTypes";
import "./js/Nodes";
import "./js/FunctionRegistry";

import { Editor } from "./js/Editor";

window.addEventListener("load", () => {
  window.App = new Editor();
});
