import { Fragment, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Copy, Download, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import AuthenticatedNav from "@/components/AuthenticatedNav";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { api, Agent, AgentCertificate, AgentCertificateDetail } from "@/lib/api";

interface Activity {
  id: string;
  target_url: string;
  method: string;
  status_code: number;
  timestamp: string;
  response_time_ms: number | null;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const AgentDetail = () => {
  const { agentId } = useParams();
  const navigate = useNavigate();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [certificates, setCertificates] = useState<AgentCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [certLoading, setCertLoading] = useState(false);
  const [issuingCert, setIssuingCert] = useState(false);
  const [revokingSerial, setRevokingSerial] = useState<string | null>(null);
  const [revokeDialogCert, setRevokeDialogCert] = useState<AgentCertificate | null>(null);
  const [advancedSerial, setAdvancedSerial] = useState<string | null>(null);
  const [detailLoadingSerial, setDetailLoadingSerial] = useState<string | null>(null);
  const [certDetails, setCertDetails] = useState<Record<string, AgentCertificateDetail>>({});

  const shortText = (value: string, prefix = 10, suffix = 8) => {
    if (!value || value.length <= prefix + suffix + 3) return value;
    return `${value.slice(0, prefix)}...${value.slice(-suffix)}`;
  };

  const getCertificateStatus = (cert: AgentCertificate): "active" | "revoked" | "expired" => {
    if (cert.revoked_at) return "revoked";
    if (new Date(cert.not_after).getTime() <= Date.now()) return "expired";
    return "active";
  };

  const fetchCertificates = async (targetAgentId: string) => {
    setCertLoading(true);
    try {
      const response = await api.listAgentCerts({
        agent_id: targetAgentId,
        status: "all",
        limit: 100,
        offset: 0,
      });
      setCertificates(response.items || []);
      setAdvancedSerial(null);
      setCertDetails({});
    } catch (error: any) {
      console.error("Error fetching certificates:", error);
      toast({
        title: "Error",
        description: "Failed to load certificates",
        variant: "destructive",
      });
    } finally {
      setCertLoading(false);
    }
  };

  const fetchAgentData = async () => {
    try {
      const session = await api.getSession();
      if (!session) {
        navigate("/login");
        return;
      }

      // Fetch agent
      const agentData = await api.getAgent(agentId!);
      setAgent(agentData);

      // Fetch activities
      const activitiesData = await api.getAgentActivity(agentId!, 50, 0);
      setActivities(activitiesData || []);
      await fetchCertificates(agentData.id);
    } catch (error: any) {
      console.error("Error fetching agent data:", error);
      toast({
        title: "Error",
        description: "Failed to load agent details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgentData();
  }, [agentId]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${label} copied to clipboard`,
    });
  };

  const deleteAgent = async () => {
    if (!agent) return;

    try {
      await api.deleteAgent(agent.id);

      toast({
        title: "Agent Deleted",
        description: "Agent has been permanently deleted",
      });
      navigate("/my-agents");
    } catch (error: any) {
      console.error("Error deleting agent:", error);
      toast({
        title: "Error",
        description: "Failed to delete agent",
        variant: "destructive",
      });
    }
  };

  const issueCertificate = async () => {
    if (!agent) return;
    setIssuingCert(true);
    try {
      const issued = await api.issueCert({ agent_id: agent.id });
      toast({
        title: "Certificate Issued",
        description: `Serial ${shortText(issued.serial)} issued successfully`,
      });
      await fetchCertificates(agent.id);
    } catch (error: any) {
      console.error("Error issuing certificate:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to issue certificate",
        variant: "destructive",
      });
    } finally {
      setIssuingCert(false);
    }
  };

  const revokeCertificate = async (serial: string) => {
    if (!agent) return;

    setRevokingSerial(serial);
    try {
      await api.revokeCert({ serial, reason: "manual-revoke" });
      toast({
        title: "Certificate Revoked",
        description: `Serial ${shortText(serial)} was revoked`,
      });
      await fetchCertificates(agent.id);
    } catch (error: any) {
      console.error("Error revoking certificate:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to revoke certificate",
        variant: "destructive",
      });
    } finally {
      setRevokingSerial(null);
      setRevokeDialogCert(null);
    }
  };

  const ensureCertDetail = async (serial: string): Promise<AgentCertificateDetail> => {
    const existing = certDetails[serial];
    if (existing) return existing;

    setDetailLoadingSerial(serial);
    try {
      const detail = await api.getCertBySerial(serial);
      setCertDetails((prev) => ({ ...prev, [serial]: detail }));
      return detail;
    } finally {
      setDetailLoadingSerial((current) => (current === serial ? null : current));
    }
  };

  const toggleAdvanced = async (serial: string) => {
    if (advancedSerial === serial) {
      setAdvancedSerial(null);
      return;
    }
    setAdvancedSerial(serial);
    try {
      await ensureCertDetail(serial);
    } catch (error: any) {
      console.error("Error loading certificate details:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load certificate details",
        variant: "destructive",
      });
    }
  };

  const downloadChainPem = async (serial: string) => {
    try {
      const detail = await ensureCertDetail(serial);
      const blob = new Blob([detail.chain_pem], { type: "application/x-pem-file" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${agent?.name || "agent"}-${serial}.chain.pem`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({
        title: "Downloaded",
        description: "Certificate chain PEM downloaded",
      });
    } catch (error: any) {
      console.error("Error downloading chain PEM:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to download chain PEM",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center">
        <p className="text-muted-foreground">Loading agent...</p>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center">
        <p className="text-muted-foreground">Agent not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <AuthenticatedNav />

      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/my-agents")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{agent.name}</h1>
              <p className="text-muted-foreground">{agent.description}</p>
            </div>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the agent and all associated activity logs. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={deleteAgent}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Agent Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Type</p>
                <Badge variant="outline" className="mt-1">
                  {agent.agent_type.replace(/_/g, " ")}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={agent.status === "active" ? "default" : "secondary"} className="mt-1 capitalize">
                  {agent.status}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Created</p>
                <p className="mt-1">{new Date(agent.created_at).toLocaleString()}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">OBA Agent ID</p>
                <p className="mt-1 text-xs break-all">
                  {agent.oba_agent_id || "—"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">OBA Parent Agent ID</p>
                <p className="mt-1 text-xs break-all">
                  {agent.oba_parent_agent_id || "—"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">OBA Principal</p>
                <p className="mt-1 text-xs break-all">
                  {agent.oba_principal || "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity Log</CardTitle>
            <CardDescription>Recent HTTP requests made by this agent</CardDescription>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No activity recorded yet</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Target URL</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Response Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activities.map((activity) => (
                      <TableRow key={activity.id}>
                        <TableCell className="text-xs">
                          {new Date(activity.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{activity.method}</Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-xs">
                          {activity.target_url}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={activity.status_code < 400 ? "default" : "destructive"}
                          >
                            {activity.status_code}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {activity.response_time_ms ? `${activity.response_time_ms}ms` : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Certificates</CardTitle>
              <CardDescription>
                Issued X.509 certificates for this agent key
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => agent && fetchCertificates(agent.id)}
                disabled={certLoading || issuingCert}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${certLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button size="sm" onClick={issueCertificate} disabled={issuingCert || certLoading}>
                {issuingCert ? "Issuing..." : "Issue certificate"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {certLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Loading certificates...</p>
            ) : certificates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No certificates issued yet
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Serial</TableHead>
                      <TableHead>Kid</TableHead>
                      <TableHead>Fingerprint</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Issued</TableHead>
                      <TableHead>Revoked</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {certificates.map((cert) => {
                      const status = getCertificateStatus(cert);
                      const detail = certDetails[cert.serial];
                      return (
                        <Fragment key={cert.id}>
                          <TableRow>
                            <TableCell className="font-mono text-xs" title={cert.serial}>
                              {shortText(cert.serial)}
                            </TableCell>
                            <TableCell className="font-mono text-xs" title={cert.kid}>
                              {shortText(cert.kid)}
                            </TableCell>
                            <TableCell className="font-mono text-xs" title={cert.fingerprint_sha256}>
                              {shortText(cert.fingerprint_sha256)}
                            </TableCell>
                            <TableCell className="text-xs">
                              {new Date(cert.not_after).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  status === "active"
                                    ? "default"
                                    : status === "revoked"
                                      ? "destructive"
                                      : "secondary"
                                }
                                className="capitalize"
                              >
                                {status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {new Date(cert.created_at).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-xs">
                              {cert.revoked_at ? new Date(cert.revoked_at).toLocaleString() : "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => copyToClipboard(cert.serial, "Serial")}
                                >
                                  <Copy className="h-3.5 w-3.5 mr-1" />
                                  Copy serial
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => copyToClipboard(cert.kid, "Kid")}
                                >
                                  <Copy className="h-3.5 w-3.5 mr-1" />
                                  Copy kid
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    copyToClipboard(cert.fingerprint_sha256, "Fingerprint")
                                  }
                                >
                                  <Copy className="h-3.5 w-3.5 mr-1" />
                                  Copy fingerprint
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => downloadChainPem(cert.serial)}
                                >
                                  <Download className="h-3.5 w-3.5 mr-1" />
                                  Download chain
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => toggleAdvanced(cert.serial)}
                                >
                                  {advancedSerial === cert.serial ? "Hide" : "Advanced"}
                                </Button>
                                {!cert.revoked_at && (
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => setRevokeDialogCert(cert)}
                                    disabled={revokingSerial === cert.serial}
                                  >
                                    {revokingSerial === cert.serial ? "Revoking..." : "Revoke"}
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                          {advancedSerial === cert.serial && (
                            <TableRow>
                              <TableCell colSpan={8}>
                                {detailLoadingSerial === cert.serial ? (
                                  <p className="text-sm text-muted-foreground py-3">
                                    Loading certificate details...
                                  </p>
                                ) : detail ? (
                                  <div className="space-y-3 py-2">
                                    <div>
                                      <p className="text-xs text-muted-foreground mb-1">
                                        Certificate PEM
                                      </p>
                                      <pre className="max-h-48 overflow-auto rounded bg-muted p-3 text-[11px]">
                                        {detail.cert_pem}
                                      </pre>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground mb-1">
                                        Chain PEM
                                      </p>
                                      <pre className="max-h-48 overflow-auto rounded bg-muted p-3 text-[11px]">
                                        {detail.chain_pem}
                                      </pre>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground py-3">
                                    No details available.
                                  </p>
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity Logging API</CardTitle>
            <CardDescription>Use this endpoint to log agent activities</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2">Endpoint</p>
                <code className="block p-3 bg-muted rounded text-xs break-all">
                  POST {API_BASE_URL}/agent-activity
                </code>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2">Request Body</p>
                <code className="block p-3 bg-muted rounded text-xs whitespace-pre">
{`{
  "agent_id": "${agent?.id}",
  "target_url": "https://example.com/api",
  "method": "GET",
  "status_code": 200,
  "response_time_ms": 150
}`}
                </code>
              </div>
            </div>
          </CardContent>
        </Card>

        <AlertDialog
          open={Boolean(revokeDialogCert)}
          onOpenChange={(open) => {
            if (!open && !revokingSerial) {
              setRevokeDialogCert(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke certificate?</AlertDialogTitle>
              <AlertDialogDescription>
                This will revoke certificate{" "}
                <span className="font-mono">{revokeDialogCert ? shortText(revokeDialogCert.serial) : ""}</span>.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={Boolean(revokingSerial)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={!revokeDialogCert || Boolean(revokingSerial)}
                onClick={() => {
                  if (revokeDialogCert) {
                    void revokeCertificate(revokeDialogCert.serial);
                  }
                }}
              >
                {revokingSerial ? "Revoking..." : "Revoke"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
};

export default AgentDetail;
