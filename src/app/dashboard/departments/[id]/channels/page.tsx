"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DepartmentDetailShell } from "@/components/departments/department-detail-shell";
import { ChannelMessageList } from "@/components/departments/channel-message-list";
import type {
  DepartmentChannelMessageView,
  DepartmentView,
} from "@/components/departments/types";

export default function DepartmentChannelsPage() {
  const params = useParams<{ id: string }>();
  const [department, setDepartment] = useState<DepartmentView | null>(null);
  const [messages, setMessages] = useState<DepartmentChannelMessageView[]>([]);
  const [channel, setChannel] = useState("");
  const [direction, setDirection] = useState("");

  useEffect(() => {
    const query = new URLSearchParams();
    if (channel) query.set("channel", channel);
    if (direction) query.set("direction", direction);
    Promise.all([
      fetch(`/api/departments/${params.id}`).then((response) => response.json()),
      fetch(`/api/departments/${params.id}/channel-messages?${query.toString()}`).then((response) => response.json()),
    ]).then(([departmentData, messagesData]) => {
      setDepartment(departmentData);
      setMessages(Array.isArray(messagesData) ? messagesData : []);
    });
  }, [params.id, channel, direction]);

  if (!department) return <div className="p-8 text-sm text-muted-foreground">Loading channels</div>;

  return (
    <DepartmentDetailShell department={department}>
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={channel}
          onChange={(event) => setChannel(event.target.value)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
        >
          <option value="">All channels</option>
          <option value="EMAIL">Email</option>
          <option value="WHATSAPP">WhatsApp</option>
        </select>
        <select
          value={direction}
          onChange={(event) => setDirection(event.target.value)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
        >
          <option value="">All directions</option>
          <option value="INBOUND">Inbound</option>
          <option value="OUTBOUND">Outbound</option>
        </select>
      </div>
      <ChannelMessageList messages={messages} />
    </DepartmentDetailShell>
  );
}
