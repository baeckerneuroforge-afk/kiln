import { TemplateEditor } from "@/components/templates/template-editor";

export default function AgentTemplateEditPage({ params }: { params: { id: string } }) {
  return <TemplateEditor kind="agents" id={params.id} />;
}
