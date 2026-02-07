export {};

declare global {
  interface Window {
    App: any;
    globalDataTypes: any;
    globalNodes: any;
    nodeTemplates: any;
    nodeConversions: any;
    typeDefinitions: any;
    FunctionRegistry: any;
  }
}
