"use client";

import { useState, useEffect } from "react";
import {
  useNSEStore,
  BrokerName,
  BrokerAccount,
  TradeMode,
} from "@/store/nse-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Link2,
  Unlink,
  Shield,
  Wallet,
  Clock,
  Building2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  FileText,
  Eye,
  EyeOff,
  Info,
  Zap,
  Paperclip,
} from "lucide-react";

const BROKER_INFO: Record<
  BrokerName,
  {
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
    hasAPI: boolean;
    description: string;
  }
> = {
  ZERODHA: {
    label: "Zerodha (Kite)",
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
    hasAPI: true,
    description: "Most popular broker in India. Kite Connect API v3.",
  },
  ANGEL_ONE: {
    label: "Angel One",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    hasAPI: true,
    description: "SmartAPI for automated trading. Free API access.",
  },
  UPSTOX: {
    label: "Upstox",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/30",
    hasAPI: true,
    description: "Upstox API v2 with OAuth support.",
  },
  DHAN: {
    label: "Dhan",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    hasAPI: true,
    description: "Dhan API for direct order placement.",
  },
  GROWW: {
    label: "Groww",
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/30",
    hasAPI: false,
    description: "No API support. Paper trade mode only.",
  },
};

interface ActivityEntry {
  id: string;
  time: string;
  action: string;
  details: string;
  status: "SUCCESS" | "FAILED" | "PENDING";
}

function formatBalance(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function timeSince(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ${diffMin % 60}m ago`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD}d ago`;
  } catch {
    return "";
  }
}

export function AccountConnector() {
  const {
    brokerAccount,
    tradeMode,
    connectBroker,
    disconnectBroker,
    setTradeMode,
    updateBrokerBalance,
    signals,
    trades,
  } = useNSEStore();

  const [selectedBroker, setSelectedBroker] = useState<BrokerName>("ZERODHA");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);

  const isConnected = brokerAccount?.status === "CONNECTED";
  const brokerInfo = brokerAccount
    ? BROKER_INFO[brokerAccount.broker]
    : BROKER_INFO[selectedBroker];

  useEffect(() => {
    if (!isConnected || !brokerAccount) return;

    const fetchBalance = async () => {
      try {
        const params = new URLSearchParams({
          broker: brokerAccount.broker,
          accessToken: brokerAccount.accessToken,
          apiKey: brokerAccount.apiKey,
          apiSecret: brokerAccount.apiSecret,
        });
        const res = await fetch(`/api/broker/balance?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          updateBrokerBalance(data.balance);
        }
      } catch {
        // Silently fail
      }
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 60000);
    return () => clearInterval(interval);
  }, [isConnected, brokerAccount, updateBrokerBalance]);

  const handleConnect = async () => {
    setError(null);
    setIsConnecting(true);

    try {
      const res = await fetch("/api/broker/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          broker: selectedBroker,
          apiKey,
          apiSecret,
          accessToken,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to connect");
        addActivity("CONNECT", `Failed: ${data.error}`, "FAILED");
        return;
      }

      const account: BrokerAccount = {
        broker: selectedBroker,
        apiKey,
        apiSecret,
        accessToken,
        status: "CONNECTED",
        balance: data.balance,
        connectedAt: data.connectedAt,
        userId: data.userId,
      };

      connectBroker(account);
      addActivity(
        "CONNECT",
        `Connected to ${brokerInfo.label} (${data.userId})`,
        "SUCCESS"
      );
    } catch (err) {
      setError("Network error. Please try again.");
      addActivity("CONNECT", "Network error", "FAILED");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    if (brokerAccount) {
      addActivity(
        "DISCONNECT",
        `Disconnected from ${BROKER_INFO[brokerAccount.broker].label}`,
        "SUCCESS"
      );
    }
    disconnectBroker();
    setApiKey("");
    setApiSecret("");
    setAccessToken("");
  };

  const addActivity = (
    action: string,
    details: string,
    status: "SUCCESS" | "FAILED" | "PENDING"
  ) => {
    const entry: ActivityEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      time: new Date().toLocaleTimeString("en-IN", { hour12: false }),
      action,
      details,
      status,
    };
    setActivityLog((prev) => [entry, ...prev].slice(0, 20));
  };

  const pendingCount = signals.filter((s) => s.status === "PENDING").length;
  const approvedCount = signals.filter((s) => s.status === "APPROVED" || s.status === "EXECUTED").length;
  const realTradesCount = trades.filter((t) => t.isRealTrade).length;
  const paperTradesCount = trades.filter((t) => !t.isRealTrade).length;

  return (
    <div className="space-y-4">
      {/* Trade Mode Toggle */}
      <Card className="t-bg-card t-border-main">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm t-text-2 flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            Trade Mode
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-3 t-bg-muted rounded-lg t-border-sub/30 border">
            <div className="flex items-center gap-3">
              <Paperclip className="h-5 w-5 t-text-4" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold t-text-2">
                    {tradeMode === "PAPER" ? "Paper Trading" : "Semi-Automatic"}
                  </span>
                  <Badge
                    className={`text-[9px] font-bold ${
                      tradeMode === "PAPER"
                        ? "t-text-7 t-text-3 t-text-6"
                        : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                    }`}
                  >
                    {tradeMode === "PAPER" ? "AUTO" : "MANUAL"}
                  </Badge>
                </div>
                <p className="text-[11px] t-text-5 mt-0.5">
                  {tradeMode === "PAPER"
                    ? "Trades auto-execute based on signals (simulation only)"
                    : "Signals require manual approval before execution"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] t-text-5">PAPER</span>
              <Switch
                checked={tradeMode === "SEMI_AUTO"}
                onCheckedChange={(checked) =>
                  setTradeMode(checked ? "SEMI_AUTO" : "PAPER")
                }
                className="data-[state=checked]:bg-amber-500"
              />
              <span className="text-[10px] text-amber-400">SEMI-AUTO</span>
            </div>
          </div>

          {tradeMode === "SEMI_AUTO" && (
            <div className="mt-2 p-2 bg-amber-500/5 border border-amber-500/20 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="text-[11px] text-amber-400/80">
                  <span className="font-bold">Semi-Auto Mode:</span> Signals will
                  be queued for approval. You must approve each signal before a
                  trade is placed.
                  {isConnected
                    ? " Approved signals will be placed as real orders on your broker."
                    : " No broker connected - approved signals will execute as paper trades."}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Broker Connection */}
      <Card className="t-bg-card t-border-main">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm t-text-2 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-emerald-400" />
              Broker Account
            </CardTitle>
            {isConnected && (
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                CONNECTED
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isConnected ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs t-text-4">Select Broker</Label>
                <Select
                  value={selectedBroker}
                  onValueChange={(v) => setSelectedBroker(v as BrokerName)}
                >
                  <SelectTrigger className="t-bg-hover t-border-main text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="t-bg-hover t-border-main">
                    {(Object.keys(BROKER_INFO) as BrokerName[]).map((key) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <span className={BROKER_INFO[key].color}>
                            {BROKER_INFO[key].label}
                          </span>
                          {!BROKER_INFO[key].hasAPI && (
                            <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30 text-[8px]">
                              NO API
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div
                className={`p-2.5 rounded-lg border ${brokerInfo.bgColor} ${brokerInfo.borderColor}`}
              >
                <p className="text-[11px] t-text-4">
                  {brokerInfo.description}
                </p>
                {!brokerInfo.hasAPI && (
                  <p className="text-[10px] text-yellow-400 mt-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Paper trade mode only - no real orders can be placed
                  </p>
                )}
              </div>

              {brokerInfo.hasAPI && (
                <div className="space-y-2.5">
                  <div className="space-y-1.5">
                    <Label className="text-xs t-text-4">API Key</Label>
                    <Input
                      type={showSecrets ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter your API key"
                      className="t-bg-hover t-border-main text-sm h-9 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs t-text-4">API Secret</Label>
                    <Input
                      type={showSecrets ? "text" : "password"}
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      placeholder="Enter your API secret"
                      className="t-bg-hover t-border-main text-sm h-9 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs t-text-4">Access Token</Label>
                    <Input
                      type={showSecrets ? "text" : "password"}
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      placeholder="Enter your access token"
                      className="t-bg-hover t-border-main text-sm h-9 font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[10px] t-text-5 h-6"
                      onClick={() => setShowSecrets(!showSecrets)}
                    >
                      {showSecrets ? (
                        <EyeOff className="h-3 w-3 mr-1" />
                      ) : (
                        <Eye className="h-3 w-3 mr-1" />
                      )}
                      {showSecrets ? "Hide" : "Show"} credentials
                    </Button>
                  </div>
                </div>
              )}

              {error && (
                <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2">
                  <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                  <p className="text-[11px] text-red-400">{error}</p>
                </div>
              )}

              <Button
                onClick={handleConnect}
                disabled={
                  isConnecting ||
                  (brokerInfo.hasAPI && (!apiKey || !apiSecret || !accessToken))
                }
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold"
              >
                {isConnecting ? (
                  <>
                    <Activity className="h-4 w-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4 mr-2" />
                    Connect {brokerInfo.label}
                  </>
                )}
              </Button>

              <div className="flex items-start gap-2 p-2 t-bg-subtle rounded-lg">
                <Shield className="h-3.5 w-3.5 t-text-5 mt-0.5 flex-shrink-0" />
                <p className="text-[10px] t-text-5 leading-relaxed">
                  Credentials are stored locally in your browser only. API calls
                  are made server-side for security. Never share your access
                  token.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-md ${brokerInfo.bgColor}`}>
                      <Building2 className={`h-4 w-4 ${brokerInfo.color}`} />
                    </div>
                    <div>
                      <p className="text-sm font-bold t-text-2">
                        {BROKER_INFO[brokerAccount.broker].label}
                      </p>
                      <p className="text-[10px] t-text-5">
                        User: {brokerAccount.userId || "N/A"}
                      </p>
                    </div>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                </div>

                <div className="flex items-center justify-between pt-2 t-border-sub/50 border-t">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs t-text-4">
                      Account Balance
                    </span>
                  </div>
                  <span className="text-lg font-bold text-emerald-400 font-mono">
                    {formatBalance(brokerAccount.balance)}
                  </span>
                </div>

                {brokerAccount.connectedAt && (
                  <div className="flex items-center gap-2 text-[10px] t-text-5">
                    <Clock className="h-3 w-3" />
                    Connected {timeSince(brokerAccount.connectedAt)}
                  </div>
                )}
              </div>

              {brokerAccount.broker === "GROWW" && (
                <div className="p-2 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
                  <p className="text-[11px] text-yellow-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3" />
                    Paper trade mode only - Groww has no API
                  </p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <div className="t-bg-muted rounded-lg p-2 text-center">
                  <p className="text-[9px] t-text-5 uppercase">Pending</p>
                  <p className="text-sm font-bold text-amber-400 font-mono">
                    {pendingCount}
                  </p>
                </div>
                <div className="t-bg-muted rounded-lg p-2 text-center">
                  <p className="text-[9px] t-text-5 uppercase">Real</p>
                  <p className="text-sm font-bold text-emerald-400 font-mono">
                    {realTradesCount}
                  </p>
                </div>
                <div className="t-bg-muted rounded-lg p-2 text-center">
                  <p className="text-[9px] t-text-5 uppercase">Paper</p>
                  <p className="text-sm font-bold t-text-4 font-mono">
                    {paperTradesCount}
                  </p>
                </div>
              </div>

              <Button
                onClick={handleDisconnect}
                variant="outline"
                className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 text-sm"
              >
                <Unlink className="h-4 w-4 mr-2" />
                Disconnect {BROKER_INFO[brokerAccount.broker].label}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* How It Works */}
      <Card className="t-bg-card t-border-main">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm t-text-2 flex items-center gap-2">
            <Info className="h-4 w-4 t-text-4" />
            How It Works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2.5">
            {[
              {
                step: "1",
                title: "Signal Generated",
                desc: "OI analysis detects unwinding signals automatically",
                icon: Zap,
                color: "text-amber-400",
              },
              {
                step: "2",
                title: tradeMode === "SEMI_AUTO" ? "Await Approval" : "Auto Execute",
                desc:
                  tradeMode === "SEMI_AUTO"
                    ? "Signal enters pending queue for your review"
                    : "Trade is immediately created (paper mode)",
                icon: tradeMode === "SEMI_AUTO" ? Shield : Activity,
                color: tradeMode === "SEMI_AUTO" ? "text-amber-400" : "text-emerald-400",
              },
              {
                step: "3",
                title: "Approve or Reject",
                desc: isConnected
                  ? "Approved - real order placed on broker"
                  : "Approved - paper trade created (no broker)",
                icon: CheckCircle2,
                color: "text-emerald-400",
              },
              {
                step: "4",
                title: "Track Results",
                desc: "Monitor P&L, manage stops, and close trades",
                icon: FileText,
                color: "t-text-4",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="flex items-start gap-3 p-2 t-bg-subtle rounded-lg"
              >
                <div
                  className={`w-6 h-6 rounded-full t-bg-hover flex items-center justify-center text-[10px] font-bold ${item.color}`}
                >
                  {item.step}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold t-text-2">{item.title}</p>
                  <p className="text-[10px] t-text-5">{item.desc}</p>
                </div>
                <item.icon className={`h-4 w-4 ${item.color} flex-shrink-0`} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {activityLog.length > 0 && (
        <Card className="t-bg-card t-border-main">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm t-text-2 flex items-center gap-2">
              <Activity className="h-4 w-4 t-text-4" />
              Broker Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
              {activityLog.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-2 p-2 t-bg-subtle rounded-md"
                >
                  {entry.status === "SUCCESS" ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  ) : entry.status === "FAILED" ? (
                    <XCircle className="h-3 w-3 text-red-400" />
                  ) : (
                    <Activity className="h-3 w-3 text-amber-400 animate-spin" />
                  )}
                  <span className="text-[10px] t-text-5 font-mono">
                    {entry.time}
                  </span>
                  <span className="text-[11px] t-text-3 font-medium">
                    {entry.action}
                  </span>
                  <span className="text-[10px] t-text-5 truncate ml-auto">
                    {entry.details}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
