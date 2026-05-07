// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VisualTeamEditor } from "@/components/teams/visual-team-editor";

type MockFlowNode = {
  id: string;
  type?: string;
  [key: string]: unknown;
};

type MockFlowEdge = {
  id?: string;
  source?: string;
  target?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

type SelectionPayload = {
  nodes: MockFlowNode[];
  edges: MockFlowEdge[];
};

type LatestReactFlowProps = {
  nodes: MockFlowNode[];
  edges: MockFlowEdge[];
  onSelectionChange?: (params: SelectionPayload) => void;
} | undefined;

const mockState = vi.hoisted(() => ({
  latestReactFlowProps: undefined as LatestReactFlowProps,
  selectionEffectRuns: 0,
  selectionEmissions: [{ nodes: [], edges: [] }] as SelectionPayload[],
  reactFlowApi: {
    fitView: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    setViewport: vi.fn(),
    getZoom: vi.fn(() => 1),
    getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
    screenToFlowPosition: vi.fn(({ x, y }: { x: number; y: number }) => ({ x, y })),
    getNodes: vi.fn(() => []),
    getEdges: vi.fn(() => []),
    getNode: vi.fn(() => undefined),
  },
}));

vi.mock("@xyflow/react", async () => {
  const ReactActual = await vi.importActual<typeof import("react")>("react");

  function MockReactFlow({
    children,
    onSelectionChange,
    nodes = [],
    edges = [],
  }: {
    children?: React.ReactNode;
    onSelectionChange?: (params: SelectionPayload) => void;
    nodes?: MockFlowNode[];
    edges?: MockFlowEdge[];
  }) {
    mockState.latestReactFlowProps = { nodes, edges, onSelectionChange };

    ReactActual.useEffect(() => {
      mockState.selectionEffectRuns += 1;
      mockState.selectionEmissions.forEach((payload) => onSelectionChange?.(payload));
    }, [onSelectionChange]);

    return ReactActual.createElement(
      "div",
      {
        "data-testid": "react-flow",
        "data-node-count": nodes.length,
        "data-edge-count": edges.length,
      },
      children
    );
  }

  return {
    ReactFlow: MockReactFlow,
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) =>
      ReactActual.createElement("div", { "data-testid": "react-flow-provider" }, children),
    Background: () => null,
    BackgroundVariant: { Dots: "dots" },
    MiniMap: () => null,
    Handle: () => null,
    Position: { Top: "top", Right: "right", Bottom: "bottom", Left: "left" },
    BaseEdge: () => null,
    EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) =>
      ReactActual.createElement(ReactActual.Fragment, null, children),
    MarkerType: { ArrowClosed: "arrowclosed" },
    Panel: ({ children }: { children: React.ReactNode }) =>
      ReactActual.createElement("div", { "data-testid": "react-flow-panel" }, children),
    SelectionMode: { Partial: "partial" },
    useReactFlow: () => mockState.reactFlowApi,
    getBezierPath: () => ["M0 0", 0, 0],
    useNodesState: (initialNodes: MockFlowNode[]) => {
      const [nodes, setNodes] = ReactActual.useState(initialNodes);
      return [nodes, setNodes, vi.fn()];
    },
    useEdgesState: (initialEdges: MockFlowEdge[]) => {
      const [edges, setEdges] = ReactActual.useState(initialEdges);
      return [edges, setEdges, vi.fn()];
    },
    addEdge: (edge: MockFlowEdge, edges: MockFlowEdge[]) => [...edges, edge],
  };
});

vi.mock("@/components/workflows/node-search", () => ({
  NodeSearch: ({ open }: { open: boolean }) =>
    open ? React.createElement("div", { "data-testid": "node-search" }) : null,
}));

vi.mock("@/components/workflows/canvas-context-menu", () => ({
  CanvasContextMenu: () => null,
}));

vi.mock("@/components/workflows/execution-timeline", () => ({
  ExecutionTimelinePanel: () => null,
}));

type EditorProps = React.ComponentProps<typeof VisualTeamEditor>;

function renderEditor(overrides: Partial<EditorProps> = {}) {
  const props: EditorProps = {
    teamId: "team-1",
    members: [],
    onNodeClick: vi.fn(),
    ...overrides,
  };

  return render(React.createElement(VisualTeamEditor, props));
}

describe("VisualTeamEditor render stability", () => {
  beforeEach(() => {
    mockState.latestReactFlowProps = undefined;
    mockState.selectionEffectRuns = 0;
    mockState.selectionEmissions = [{ nodes: [], edges: [] }];
    Object.values(mockState.reactFlowApi).forEach((fn) => {
      if (typeof fn === "function" && "mockClear" in fn) fn.mockClear();
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not re-render loop when React Flow reports the initial empty selection", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    renderEditor();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(consoleError.mock.calls.flat().join("\n")).not.toContain("Maximum update depth");
    expect(mockState.selectionEffectRuns).toBe(1);
  });

  it("loads existing workflow data and handles multi-selection without retriggering the selection listener", async () => {
    mockState.selectionEmissions = [
      {
        nodes: [
          { id: "wf-transform", type: "workflowNode" },
          { id: "wf-http", type: "workflowNode" },
        ],
        edges: [],
      },
    ];

    renderEditor({
      workflowNodes: [
        {
          id: "wf-transform",
          type: "transform",
          label: "Normalize Lead",
          position: { x: 0, y: 0 },
          config: { expression: "return input" },
        },
        {
          id: "wf-http",
          type: "http_request",
          label: "Send to CRM",
          position: { x: 280, y: 0 },
          config: { method: "POST", url: "https://example.test" },
        },
      ],
      workflowEdges: [
        {
          sourceId: "wf-transform",
          targetId: "wf-http",
          mappings: [{ source: "output.email", target: "body.email" }],
        },
      ],
    });

    expect(await screen.findByText("2 selected")).toBeInTheDocument();

    await waitFor(() => {
      expect(mockState.latestReactFlowProps?.nodes).toHaveLength(2);
      expect(mockState.latestReactFlowProps?.edges).toHaveLength(1);
    });

    expect(mockState.latestReactFlowProps?.edges[0].data).toMatchObject({
      mappingCount: 1,
      schemaMismatch: false,
      dataLabel: "1 field mapped",
    });
    expect(mockState.selectionEffectRuns).toBe(1);
  });
});
