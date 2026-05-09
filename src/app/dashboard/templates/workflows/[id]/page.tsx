import { TemplateEditor } from "@/components/templates/template-editor";

export default function WorkflowTemplateEditPage({ params }: { params: { id: string } }) {
  return <TemplateEditor kind="workflows" id={params.id} />;
}
