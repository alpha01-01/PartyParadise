"use client";

import { formatDate } from "@/lib/utils";
import { PageHeading, PortalList, usePortalData } from "../portalData";

type PortalDocument = {
  id: string;
  name: string;
  type: string;
  file_url: string;
  created_at: string;
};

export default function PortalDocumentsPage() {
  const { data, loading, error } = usePortalData<PortalDocument[]>("/portal/documents");

  return (
    <>
      <PageHeading title="Documents" subtitle="Files shared with you by PartyParadise." />
      <PortalList loading={loading} error={error} empty={!data?.length && "No documents yet"}>
        <table className="pp-table">
          <thead>
            <tr><th>Name</th><th>Added</th></tr>
          </thead>
          <tbody>
            {data?.map((document) => (
              <tr key={document.id}>
                <td><a href={document.file_url} target="_blank" rel="noreferrer">{document.name}</a></td>
                <td>{formatDate(document.created_at, "short")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PortalList>
    </>
  );
}
