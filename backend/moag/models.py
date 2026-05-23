"""
Pydantic-DTOs fuer die MOAG-API.

Enthält Cluster-, Hub- und Job-Schemas die direkt in MOAG definiert sind
(ohne sebald-schemas-Abhaengigkeit, damit MOAG eigenstaendig deployt werden kann).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


# ── Cluster / Hub ──────────────────────────────────────────────────────────────

class HubConfig(BaseModel):
    """Konfiguration eines OctoBoss-Hubs."""
    id: str
    name: str
    url: str
    token: Optional[str] = None


class NodeHardware(BaseModel):
    """Hardware-Metriken eines Cluster-Nodes."""
    gpu_name: Optional[str] = None
    gpu_load_percent: Optional[float] = None
    cpu_load_percent: Optional[float] = None
    cpu_model: Optional[str] = None
    ram_free_gb: Optional[float] = None
    vram_free_gb: Optional[float] = None


class ModuleInfo(BaseModel):
    """Modul-Info eines Cluster-Nodes."""
    name: str
    version: str = "?"


class ClusterNode(BaseModel):
    """Ein Cluster-Node (verbunden via OctoBoss-Hub)."""
    node_id: str
    hostname: str
    connected: bool = False
    last_heartbeat: Optional[datetime] = None
    hardware: NodeHardware = Field(default_factory=NodeHardware)
    engines: list[str] = Field(default_factory=list)
    modules: list[ModuleInfo] = Field(default_factory=list)
    last_known_ip: Optional[str] = None


class HubStatus(BaseModel):
    """Status eines OctoBoss-Hubs."""
    id: str
    name: str
    url: str
    reachable: bool = False
    latency_ms: Optional[int] = None
    nodes_total: int = 0
    nodes_connected: int = 0
    engines_count: int = 0
    is_default: bool = False
    last_check: datetime = Field(default_factory=lambda: datetime.now())
    error: Optional[str] = None


class EdgeLogEntry(BaseModel):
    """Ein Edge-Log-Eintrag."""
    ts: datetime
    level: str
    category: str
    message: str


# ── Settings ───────────────────────────────────────────────────────────────────

VotingStrategy = Literal["consensus", "majority", "best", "single"]


class Settings(BaseModel):
    """Persistierte MOAG-Settings."""
    hubs: list[HubConfig] = Field(default_factory=list)
    default_hub_id: str = ""
    cluster_enabled: bool = True
    voting_engines: list[str] = Field(default_factory=lambda: ["tesseract", "easyocr"])
    voting_strategy: VotingStrategy = "consensus"
    fallback_to_local: bool = True
    api_token: Optional[str] = None
    pipeline_log_enabled: bool = True
    # Doctype-Gewichte
    doctype_text_gewicht: float = 0.7
    doctype_layout_gewicht: float = 0.3
    # Oberon
    oberon_base_url: str = "http://192.168.200.169:17900"
    oberon_token: Optional[str] = None
    # OCRexpert-HTTP-Service
    ocrexpert_base_url: str = "http://192.168.200.71:17810"
    # SonOfSETI
    sonofseti_token: Optional[str] = None
    # OctoBoss Admin (fuer Manifest-Default / Node-Pinning)
    octoboss_admin_token: Optional[str] = None
    # NasDominator
    nasdominator_base_url: str = "http://192.168.200.169:9090"
    nasdominator_user: Optional[str] = None
    nasdominator_password: Optional[str] = None
    # Custos
    custos_base_url: str = "http://192.168.200.71:17890"
    # Panopticor (Desktop-Endpoint)
    panopticor_base_url: str = "http://127.0.0.1:8787"


class SettingsResponse(Settings):
    """Settings + Read-Only-Felder fuer das UI."""
    active_env: dict[str, str] = Field(default_factory=dict)
    settings_path: str = ""


class SettingsUpdate(BaseModel):
    """Partielle Settings-Aktualisierung."""
    hubs: Optional[list[HubConfig]] = None
    default_hub_id: Optional[str] = None
    cluster_enabled: Optional[bool] = None
    voting_engines: Optional[list[str]] = None
    voting_strategy: Optional[VotingStrategy] = None
    fallback_to_local: Optional[bool] = None
    api_token: Optional[str] = None
    pipeline_log_enabled: Optional[bool] = None
    doctype_text_gewicht: Optional[float] = None
    doctype_layout_gewicht: Optional[float] = None
    oberon_base_url: Optional[str] = None
    oberon_token: Optional[str] = None
    ocrexpert_base_url: Optional[str] = None
    sonofseti_token: Optional[str] = None
    octoboss_admin_token: Optional[str] = None
    nasdominator_base_url: Optional[str] = None
    nasdominator_user: Optional[str] = None
    nasdominator_password: Optional[str] = None
    custos_base_url: Optional[str] = None
    panopticor_base_url: Optional[str] = None


# ── Health / UI-Wrappers ───────────────────────────────────────────────────────

class HubTestRequest(BaseModel):
    """Ad-hoc-Test einer Hub-URL."""
    url: str
    token: Optional[str] = None


class HubTestResult(BaseModel):
    ok: bool
    latency_ms: Optional[int] = None
    status_code: Optional[int] = None
    error: Optional[str] = None


class HubListResponse(BaseModel):
    hubs: list[HubStatus]


class NodeListResponse(BaseModel):
    nodes: list[ClusterNode]


class EngineMatrix(BaseModel):
    engines: list[str]
    nodes: list[str]
    available: list[list[str]]


class EdgeLogResponse(BaseModel):
    events: list[EdgeLogEntry]


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
    build: str
    build_ts: Optional[datetime] = None
    pipeline_ready: bool = True


# ── Job-Schemas ────────────────────────────────────────────────────────────────

JobStatusLiteral = Literal["pending", "running", "done", "failed"]


class JobStatus(BaseModel):
    job_id: str
    filename: str
    status: JobStatusLiteral
    progress_pct: int = 0
    page_total: int = 0
    page_done: int = 0
    started_at: datetime
    finished_at: Optional[datetime] = None
    doctype: Optional[str] = None
    doctype_confidence: Optional[float] = None
    pii_count: Optional[int] = None
    consensus_score: Optional[float] = None
    engines_used: list[str] = Field(default_factory=list)
    nodes_used: list[str] = Field(default_factory=list)
    error: Optional[str] = None
    file_path: Optional[str] = None
    output_path: Optional[str] = None


class JobListResponse(BaseModel):
    jobs: list[JobStatus]
    total: int
    filtered: int


class JobUploadResult(BaseModel):
    job_ids: list[str]
    accepted: int
    rejected: list[dict[str, Any]] = Field(default_factory=list)
