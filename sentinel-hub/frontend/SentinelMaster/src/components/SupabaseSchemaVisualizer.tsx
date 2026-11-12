'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Badge, Card, Dot, Empty, ErrorAlert, Loading } from './ui';
import { usePoll } from './useApi';
import { formatBytes, formatNumber } from './format';
import type { DbColumn, DbInspection, DbQueryResult, DbTableSummary } from '@/lib/db';

interface InspectionPayload extends DbInspection {
  configured?: boolean;
  reason?: string;
}

interface SupabaseSchemaVisualizerProps {
  id: string;
  availableDbs?: { id: string; path: string; name: string }[];
  onSelectDb?: (id: string) => void;
  onClose?: () => void;
  isModal?: boolean;
}

interface Position {
  x: number;
  y: number;
}

interface Relation {
  id: string;
  sourceTable: string;
  sourceCol: string;
  targetTable: string;
  targetCol: string;
  onDelete?: string;
  onUpdate?: string;
  isExplicit: boolean;
}

const PREVIEW_LIMIT = 50;
const CARD_WIDTH = 300;

export default function SupabaseSchemaVisualizer({
  id,
  availableDbs,
  onSelectDb,
  onClose,
  isModal = false,
}: SupabaseSchemaVisualizerProps) {
  const [currentId, setCurrentId] = useState(id);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedSql, setCopiedSql] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Position>({ x: 40, y: 40 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState<Position>({ x: 0, y: 0 });
  const [tablePositions, setTablePositions] = useState<Record<string, Position>>({});
  const [draggingTable, setDraggingTable] = useState<{ name: string; offset: Position } | null>(null);
  const [hoveredTable, setHoveredTable] = useState<string | null>(null);
  const [hoveredRelation, setHoveredRelation] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentId(id);
  }, [id]);

  const inspection = usePoll<InspectionPayload>(`/api/db/${encodeURIComponent(currentId)}`, 0);
  const data = inspection.data;
  const tables = useMemo(() => data?.tables ?? [], [data]);

  // Extract all foreign key and inferred relationships
  const relations = useMemo(() => {
    const list: Relation[] = [];
    if (!tables.length) return list;

    const tableNames = new Set(tables.map((t) => t.name.toLowerCase()));

    for (const tbl of tables) {
      // 1. Explicit foreign keys from PRAGMA foreign_key_list
      if (tbl.foreignKeys && tbl.foreignKeys.length > 0) {
        for (const fk of tbl.foreignKeys) {
          if (fk.table && tableNames.has(fk.table.toLowerCase())) {
            list.push({
              id: `${tbl.name}.${fk.from}->${fk.table}.${fk.to}`,
              sourceTable: tbl.name,
              sourceCol: fk.from,
              targetTable: fk.table,
              targetCol: fk.to || 'id',
              onDelete: fk.onDelete,
              onUpdate: fk.onUpdate,
              isExplicit: true,
            });
          }
        }
      }

      // 2. Heuristic relationships based on naming conventions (e.g., project_id -> projects.id)
      for (const col of tbl.columns ?? []) {
        const colName = col.name.toLowerCase();
        if (colName.endsWith('_id') && colName !== 'id') {
          const stem = colName.slice(0, -3);
          const candidates = [stem, `${stem}s`, `${stem}es`];
          for (const cand of candidates) {
            const matched = tables.find((t) => t.name.toLowerCase() === cand);
            if (matched && matched.name !== tbl.name) {
              const relId = `${tbl.name}.${col.name}->${matched.name}.id`;
              if (!list.some((r) => r.id === relId)) {
                list.push({
                  id: relId,
                  sourceTable: tbl.name,
                  sourceCol: col.name,
                  targetTable: matched.name,
                  targetCol: 'id',
                  isExplicit: false,
                });
              }
              break;
            }
          }
        }
      }
    }
    return list;
  }, [tables]);

  // Calculate smart DAG / grid layout
  const calculateAutoLayout = useCallback(() => {
    if (!tables.length) return;

    const tiers: string[][] = [[], [], [], []];
    tables.forEach((t) => {
      const outCount = relations.filter((r) => r.targetTable === t.name).length;
      const inCount = relations.filter((r) => r.sourceTable === t.name).length;

      if (inCount === 0 && outCount > 0) {
        // Root tables (referenced by others, no outbound FKs)
        tiers[0].push(t.name);
      } else if (inCount > 0 && outCount > 0) {
        // Intermediate tables
        tiers[1].push(t.name);
      } else if (inCount > 0 && outCount === 0) {
        // Leaf tables
        tiers[2].push(t.name);
      } else {
        // Independent / auxiliary tables
        tiers[3].push(t.name);
      }
    });

    const positions: Record<string, Position> = {};
    const colSpacing = 380;
    const rowSpacing = 280;

    let colIndex = 0;
    tiers.forEach((tier) => {
      if (tier.length === 0) return;
      const maxPerCol = 4;
      const subCols = Math.ceil(tier.length / maxPerCol);

      for (let sc = 0; sc < subCols; sc++) {
        const slice = tier.slice(sc * maxPerCol, (sc + 1) * maxPerCol);
        slice.forEach((name, rIdx) => {
          positions[name] = {
            x: (colIndex + sc) * colSpacing + 60,
            y: rIdx * rowSpacing + 60,
          };
        });
      }
      colIndex += subCols;
    });

    setTablePositions(positions);
    setPan({ x: 40, y: 40 });
    setZoom(1);
  }, [tables, relations]);

  // Initial layout calculation when tables load
  useEffect(() => {
    if (tables.length > 0 && Object.keys(tablePositions).length === 0) {
      calculateAutoLayout();
    }
  }, [tables, tablePositions, calculateAutoLayout]);

  // Canvas Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.erd-card, .erd-drawer, .erd-toolbar')) return;
    setIsPanning(true);
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
    } else if (draggingTable) {
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      const newX = (e.clientX - containerRect.left - pan.x) / zoom - draggingTable.offset.x;
      const newY = (e.clientY - containerRect.top - pan.y) / zoom - draggingTable.offset.y;
      setTablePositions((prev) => ({
        ...prev,
        [draggingTable.name]: { x: Math.round(newX), y: Math.round(newY) },
      }));
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingTable(null);
  };

  // Zoom controls
  const handleZoom = (delta: number) => {
    setZoom((prev) => Math.min(1.8, Math.max(0.4, Number((prev + delta).toFixed(1)))));
  };

  // Generate SQL DDL
  const handleCopySql = () => {
    if (!data?.tables) return;
    let sql = `-- Schema DDL Export for ${data.path}\n-- Generated by Sentinel Master Supabase Schema Visualizer\n\n`;

    for (const tbl of data.tables) {
      sql += `CREATE TABLE IF NOT EXISTS "${tbl.name}" (\n`;
      const colDefs: string[] = [];
      const pks: string[] = [];

      for (const col of tbl.columns ?? []) {
        let def = `  "${col.name}" ${col.type || 'TEXT'}`;
        if (col.notNull) def += ' NOT NULL';
        if (col.pk) pks.push(`"${col.name}"`);
        colDefs.push(def);
      }

      if (pks.length > 0) {
        colDefs.push(`  PRIMARY KEY (${pks.join(', ')})`);
      }

      if (tbl.foreignKeys && tbl.foreignKeys.length > 0) {
        for (const fk of tbl.foreignKeys) {
          let fkDef = `  FOREIGN KEY ("${fk.from}") REFERENCES "${fk.table}"("${fk.to || 'id'}")`;
          if (fk.onDelete) fkDef += ` ON DELETE ${fk.onDelete}`;
          if (fk.onUpdate) fkDef += ` ON UPDATE ${fk.onUpdate}`;
          colDefs.push(fkDef);
        }
      }

      sql += colDefs.join(',\n');
      sql += '\n);\n\n';
    }

    navigator.clipboard.writeText(sql).then(() => {
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2400);
    });
  };

  // Connected tables for the active table
  const activeConnectedTables = useMemo(() => {
    if (!selectedTable) return { belongsTo: [], referencedBy: [] };
    const belongsTo = relations
      .filter((r) => r.sourceTable === selectedTable)
      .map((r) => ({ table: r.targetTable, col: r.sourceCol, targetCol: r.targetCol }));
    const referencedBy = relations
      .filter((r) => r.targetTable === selectedTable)
      .map((r) => ({ table: r.sourceTable, col: r.targetCol, fromCol: r.sourceCol }));
    return { belongsTo, referencedBy };
  }, [selectedTable, relations]);

  // Extract database name from path
  const dbFileName = useMemo(() => {
    if (!data?.path) return 'Database';
    const parts = data.path.split(/[/\\]/);
    return parts[parts.length - 1];
  }, [data]);

  return (
    <div
      ref={containerRef}
      className="supabase-visualizer-container"
      style={{
        position: 'relative',
        width: '100%',
        height: isModal ? '86vh' : '780px',
        minHeight: '600px',
        backgroundColor: '#0c0d12',
        color: '#f8fafc',
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1px solid #262d3a',
        boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        userSelect: isPanning || draggingTable ? 'none' : 'auto',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* ── Top Supabase Toolbar (High-Contrast Slate) ── */}
      <div
        className="erd-toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          background: '#161922',
          borderBottom: '1px solid #262c38',
          zIndex: 40,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        {/* Left: DB Selector & Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              background: '#1f2430',
              borderRadius: '8px',
              border: '1px solid #333d4e',
            }}
          >
            <span style={{ color: '#3ecf8e', fontSize: '15px' }}>⚡</span>
            {availableDbs && availableDbs.length > 1 ? (
              <select
                value={currentId}
                onChange={(e) => {
                  setCurrentId(e.target.value);
                  onSelectDb?.(e.target.value);
                  setTablePositions({});
                }}
                style={{
                  background: 'transparent',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '13px',
                  fontFamily: 'var(--mono)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {availableDbs.map((db) => (
                  <option key={db.id} value={db.id} style={{ background: '#161922', color: '#ffffff' }}>
                    {db.name} ({db.path.split(/[/\\]/).pop()})
                  </option>
                ))}
              </select>
            ) : (
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, fontSize: '13px', color: '#ffffff' }}>
                {dbFileName}
              </span>
            )}
            <span
              style={{
                fontSize: '11px',
                padding: '2px 7px',
                borderRadius: '10px',
                background: 'rgba(62, 207, 142, 0.15)',
                color: '#3ecf8e',
                fontWeight: 600,
                border: '1px solid rgba(62, 207, 142, 0.3)',
              }}
            >
              schema: public
            </span>
          </div>

          <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>
            {tables.length} tables · {relations.length} relations
          </span>
        </div>

        {/* Center: Search Table Input */}
        <div style={{ position: 'relative', minWidth: 260 }}>
          <span
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#94a3b8',
              fontSize: '13px',
              pointerEvents: 'none',
            }}
          >
            🔍
          </span>
          <input
            type="text"
            placeholder="Find table or column..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              paddingLeft: 32,
              paddingRight: 28,
              height: 34,
              fontSize: '12px',
              width: '100%',
              borderRadius: '8px',
              background: '#0f1218',
              color: '#ffffff',
              border: '1px solid #333d4e',
              outline: 'none',
              fontFamily: 'var(--sans)',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Right: Actions (Copy SQL, Auto Layout, Zoom Controls) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={handleCopySql}
            title="Export complete schema DDL"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '8px',
              cursor: 'pointer',
              background: copiedSql ? 'rgba(62, 207, 142, 0.25)' : '#1f2430',
              color: copiedSql ? '#3ecf8e' : '#f8fafc',
              border: copiedSql ? '1px solid #3ecf8e' : '1px solid #333d4e',
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            <span>{copiedSql ? '✓ Copied' : '📋 Copy as SQL'}</span>
          </button>

          <button
            type="button"
            onClick={calculateAutoLayout}
            title="Rearrange tables into an organized graph"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '8px',
              cursor: 'pointer',
              background: '#1f2430',
              color: '#f8fafc',
              border: '1px solid #333d4e',
            }}
          >
            <span>⚡ Auto layout</span>
          </button>

          {/* Zoom controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: '#1f2430',
              borderRadius: '8px',
              border: '1px solid #333d4e',
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={() => handleZoom(-0.1)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#f8fafc',
                padding: '6px 10px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
              }}
              title="Zoom out"
            >
              −
            </button>
            <span
              style={{
                fontSize: '11px',
                fontFamily: 'var(--mono)',
                color: '#cbd5e1',
                padding: '0 6px',
                minWidth: 44,
                textAlign: 'center',
                fontWeight: 600,
              }}
            >
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => handleZoom(0.1)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#f8fafc',
                padding: '6px 10px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
              }}
              title="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPan({ x: 40, y: 40 });
              }}
              style={{
                background: 'transparent',
                borderLeft: '1px solid #333d4e',
                borderRight: 'none',
                borderTop: 'none',
                borderBottom: 'none',
                color: '#94a3b8',
                padding: '6px 8px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 500,
              }}
              title="Reset view"
            >
              Reset
            </button>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close Visualizer"
              style={{
                marginLeft: 6,
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: '8px',
                cursor: 'pointer',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#f87171',
                border: '1px solid rgba(239, 68, 68, 0.35)',
              }}
            >
              ✕ Close
            </button>
          )}
        </div>
      </div>

      {/* ── Main Canvas Viewport (High-Contrast Dot Grid) ── */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          width: '100%',
          overflow: 'hidden',
          cursor: isPanning ? 'grabbing' : 'grab',
          backgroundColor: '#0c0d12',
          backgroundImage:
            'radial-gradient(circle, rgba(255, 255, 255, 0.16) 1.2px, transparent 1.2px)',
          backgroundSize: '24px 24px',
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        {inspection.loading && !data && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 30,
              background: 'rgba(12, 14, 18, 0.85)',
            }}
          >
            <Loading label="Generating Supabase Schema Visualizer…" />
          </div>
        )}

        {inspection.error && !data ? (
          <div style={{ padding: 24, maxWidth: 600, margin: '40px auto' }}>
            <ErrorAlert error={inspection.error} onRetry={inspection.reload} />
          </div>
        ) : null}

        {/* Transformable Canvas Layer */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            width: '4000px',
            height: '4000px',
            pointerEvents: 'auto',
          }}
        >
          {/* SVG Relationship Connector Lines Layer */}
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              overflow: 'visible',
            }}
          >
            <defs>
              <marker
                id="erd-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#3ecf8e" />
              </marker>
              <marker
                id="erd-arrow-active"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0.5 L 10 5 L 0 9.5 z" fill="#38bdf8" />
              </marker>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {relations.map((rel) => {
              const srcPos = tablePositions[rel.sourceTable];
              const tgtPos = tablePositions[rel.targetTable];
              if (!srcPos || !tgtPos) return null;

              const srcTable = tables.find((t) => t.name === rel.sourceTable);
              const colIdx = srcTable?.columns?.findIndex((c) => c.name === rel.sourceCol) ?? 0;
              const sourceY = srcPos.y + 44 + Math.min(colIdx, 10) * 26 + 13;
              const targetY = tgtPos.y + 44 + 13;

              const isRight = tgtPos.x >= srcPos.x;
              const x1 = isRight ? srcPos.x + CARD_WIDTH : srcPos.x;
              const y1 = sourceY;
              const x2 = isRight ? tgtPos.x : tgtPos.x + CARD_WIDTH;
              const y2 = targetY;

              const dx = Math.max(50, Math.abs(x2 - x1) * 0.45);
              const pathD = `M ${x1} ${y1} C ${x1 + (isRight ? dx : -dx)} ${y1}, ${
                x2 + (isRight ? -dx : dx)
              } ${y2}, ${x2} ${y2}`;

              const isHovered =
                hoveredRelation === rel.id ||
                hoveredTable === rel.sourceTable ||
                hoveredTable === rel.targetTable ||
                selectedTable === rel.sourceTable ||
                selectedTable === rel.targetTable;

              return (
                <g key={rel.id}>
                  {/* Invisible thicker path for easy hovering */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="16"
                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredRelation(rel.id)}
                    onMouseLeave={() => setHoveredRelation(null)}
                  />
                  {/* Visual path line */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={isHovered ? '#38bdf8' : 'rgba(62, 207, 142, 0.45)'}
                    strokeWidth={isHovered ? 2.5 : 1.5}
                    strokeDasharray={rel.isExplicit ? undefined : '5,4'}
                    markerEnd={isHovered ? 'url(#erd-arrow-active)' : 'url(#erd-arrow)'}
                    filter={isHovered ? 'url(#glow)' : undefined}
                    style={{
                      transition: 'stroke 0.2s, stroke-width 0.2s',
                    }}
                  />
                </g>
              );
            })}
          </svg>

          {/* Table Cards ("Kotak-kotak Supabase") */}
          {tables.map((table) => {
            const pos = tablePositions[table.name] ?? { x: 80, y: 80 };
            const isMatch =
              !searchQuery.trim() ||
              table.name.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
              table.columns?.some((c) =>
                c.name.toLowerCase().includes(searchQuery.toLowerCase().trim()),
              );

            const isSelected = selectedTable === table.name;
            const isTableHovered = hoveredTable === table.name;
            const isConnectedToHovered =
              hoveredTable !== null &&
              relations.some(
                (r) =>
                  (r.sourceTable === hoveredTable && r.targetTable === table.name) ||
                  (r.targetTable === hoveredTable && r.sourceTable === table.name),
              );

            const displayColumns = table.columns?.slice(0, 10) ?? [];
            const remainingCount = (table.columns?.length ?? 0) - displayColumns.length;

            return (
              <div
                key={table.name}
                className="erd-card"
                style={{
                  position: 'absolute',
                  left: `${pos.x}px`,
                  top: `${pos.y}px`,
                  width: `${CARD_WIDTH}px`,
                  borderRadius: '10px',
                  backgroundColor: '#161922',
                  border: isSelected
                    ? '2px solid #3ecf8e'
                    : isTableHovered || isConnectedToHovered
                    ? '1.5px solid #38bdf8'
                    : '1px solid #2b3342',
                  boxShadow: isSelected
                    ? '0 0 25px rgba(62, 207, 142, 0.35), 0 10px 30px rgba(0,0,0,0.6)'
                    : isTableHovered
                    ? '0 0 20px rgba(56, 189, 248, 0.3), 0 8px 24px rgba(0,0,0,0.5)'
                    : '0 8px 24px rgba(0,0,0,0.5)',
                  opacity: isMatch ? 1 : 0.25,
                  transition: 'border-color 0.18s, box-shadow 0.18s, opacity 0.2s',
                  zIndex: isSelected ? 30 : isTableHovered ? 25 : 10,
                  overflow: 'hidden',
                  cursor: 'pointer',
                }}
                onMouseEnter={() => setHoveredTable(table.name)}
                onMouseLeave={() => setHoveredTable(null)}
                onClick={() => setSelectedTable(table.name)}
              >
                {/* Card Header (Draggable Handle & Title) */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: isSelected
                      ? 'rgba(62, 207, 142, 0.15)'
                      : 'rgba(255, 255, 255, 0.04)',
                    borderBottom: '1px solid #262c38',
                    cursor: 'grab',
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const containerRect = containerRef.current?.getBoundingClientRect();
                    if (!containerRect) return;
                    const cardX = (e.clientX - containerRect.left - pan.x) / zoom;
                    const cardY = (e.clientY - containerRect.top - pan.y) / zoom;
                    setDraggingTable({
                      name: table.name,
                      offset: { x: cardX - pos.x, y: cardY - pos.y },
                    });
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: '13px', color: '#3ecf8e' }}>⊞</span>
                    <span
                      style={{
                        fontFamily: 'var(--mono)',
                        fontWeight: 700,
                        fontSize: '13px',
                        color: '#ffffff',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={table.name}
                    >
                      {table.name}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontFamily: 'var(--mono)',
                        padding: '2px 6px',
                        borderRadius: '6px',
                        background: '#21262d',
                        color: '#94a3b8',
                        border: '1px solid #333d4e',
                      }}
                    >
                      {table.rows === null ? '—' : `${formatNumber(table.rows)} r`}
                    </span>
                    <button
                      type="button"
                      style={{
                        background: 'rgba(62, 207, 142, 0.18)',
                        border: '1px solid rgba(62, 207, 142, 0.35)',
                        borderRadius: '6px',
                        color: '#3ecf8e',
                        padding: '2px 7px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTable(table.name);
                      }}
                      title="Inspect live records in this table"
                    >
                      Browse ↗
                    </button>
                  </div>
                </div>

                {/* Columns List */}
                <div style={{ padding: '6px 0', maxHeight: '280px', overflowY: 'auto' }}>
                  {displayColumns.map((col) => {
                    const isFk = relations.some(
                      (r) => r.sourceTable === table.name && r.sourceCol === col.name,
                    );

                    return (
                      <div
                        key={col.name}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '4px 14px',
                          fontSize: '12px',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                        }}
                      >
                        {/* Icon & Column Name */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          {col.pk ? (
                            <span
                              style={{ color: '#f59e0b', fontSize: '11px', flexShrink: 0 }}
                              title="Primary Key"
                            >
                              🗝️
                            </span>
                          ) : isFk ? (
                            <span
                              style={{ color: '#38bdf8', fontSize: '11px', flexShrink: 0 }}
                              title="Foreign Key"
                            >
                              🔗
                            </span>
                          ) : col.notNull ? (
                            <span
                              style={{ color: '#cbd5e1', fontSize: '10px', flexShrink: 0 }}
                              title="Non-Nullable"
                            >
                              ◆
                            </span>
                          ) : (
                            <span
                              style={{ color: '#64748b', fontSize: '10px', flexShrink: 0 }}
                              title="Nullable"
                            >
                              ○
                            </span>
                          )}

                          <span
                            style={{
                              fontFamily: 'var(--mono)',
                              color: col.pk
                                ? '#f59e0b'
                                : isFk
                                ? '#38bdf8'
                                : '#e6edf3',
                              fontWeight: col.pk ? 600 : 400,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {col.name}
                          </span>

                          {col.sensitive && (
                            <span style={{ fontSize: '10px', color: '#f59e0b' }} title="Masked column">
                              🔒
                            </span>
                          )}
                        </div>

                        {/* Column Type */}
                        <span
                          style={{
                            fontFamily: 'var(--mono)',
                            fontSize: '10px',
                            color: '#94a3b8',
                            marginLeft: 8,
                            flexShrink: 0,
                          }}
                        >
                          {(col.type || 'text').toLowerCase()}
                        </span>
                      </div>
                    );
                  })}

                  {remainingCount > 0 && (
                    <div
                      style={{
                        padding: '4px 14px',
                        fontSize: '11px',
                        color: '#94a3b8',
                        fontFamily: 'var(--mono)',
                        textAlign: 'center',
                        background: 'rgba(255, 255, 255, 0.02)',
                      }}
                    >
                      +{remainingCount} more columns...
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Bottom Supabase Legend Bar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 18px',
          background: '#161922',
          borderTop: '1px solid #262c38',
          zIndex: 35,
          fontSize: '11px',
          color: '#cbd5e1',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#f59e0b' }}>🗝️</span> Primary key
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#38bdf8' }}>🔗</span> Foreign key
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#cbd5e1' }}>◆</span> Non-Nullable
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#64748b' }}>○</span> Nullable
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#f59e0b' }}>🔒</span> Masked Sensitive
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#94a3b8' }}>
          <span>Click any table card to view live records</span>
          <span style={{ opacity: 0.5 }}>•</span>
          <span>Drag cards to customize layout</span>
        </div>
      </div>

      {/* ── "bila click kotak tu, boleh tengok list2 dalam database tu" ── */}
      {/* Interactive Supabase Table Records Slide-Over Drawer */}
      {selectedTable && (
        <div
          className="erd-drawer"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: 'min(640px, 92vw)',
            background: '#161922',
            borderLeft: '1px solid #2b3342',
            boxShadow: '-10px 0 40px rgba(0, 0, 0, 0.85)',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Drawer Header */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #262c38',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#1a1e29',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#3ecf8e', fontSize: '15px' }}>⊞</span>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '16px',
                    fontFamily: 'var(--mono)',
                    fontWeight: 700,
                    color: '#ffffff',
                  }}
                >
                  {selectedTable}
                </h3>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: 'rgba(62, 207, 142, 0.15)',
                    color: '#3ecf8e',
                    border: '1px solid rgba(62, 207, 142, 0.3)',
                    fontFamily: 'var(--mono)',
                  }}
                >
                  Table Explorer
                </span>
              </div>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: '12px',
                  color: '#94a3b8',
                  fontFamily: 'var(--mono)',
                }}
              >
                SELECT * FROM "{selectedTable}" LIMIT 50;
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedTable(null)}
              style={{
                fontSize: '15px',
                padding: '4px 8px',
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
              }}
              title="Close records drawer"
            >
              ✕
            </button>
          </div>

          {/* Quick Jump Relations Chips */}
          {(activeConnectedTables.belongsTo.length > 0 ||
            activeConnectedTables.referencedBy.length > 0) && (
            <div
              style={{
                padding: '8px 20px',
                background: '#12151c',
                borderBottom: '1px solid #262c38',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                overflowX: 'auto',
                fontSize: '11px',
              }}
            >
              <span style={{ color: '#8b949e', whiteSpace: 'nowrap' }}>
                Relations:
              </span>
              {activeConnectedTables.belongsTo.map((rel) => (
                <button
                  key={rel.table}
                  type="button"
                  onClick={() => setSelectedTable(rel.table)}
                  style={{
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    borderRadius: '6px',
                    color: '#38bdf8',
                    padding: '2px 8px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    fontFamily: 'var(--mono)',
                  }}
                  title={`Belongs to ${rel.table} via ${rel.col}`}
                >
                  Belongs to: {rel.table} ➔
                </button>
              ))}
              {activeConnectedTables.referencedBy.map((rel) => (
                <button
                  key={rel.table}
                  type="button"
                  onClick={() => setSelectedTable(rel.table)}
                  style={{
                    background: 'rgba(62, 207, 142, 0.15)',
                    border: '1px solid rgba(62, 207, 142, 0.35)',
                    borderRadius: '6px',
                    color: '#3ecf8e',
                    padding: '2px 8px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    fontFamily: 'var(--mono)',
                  }}
                  title={`Referenced by ${rel.table} via ${rel.fromCol}`}
                >
                  Has many: {rel.table} ➔
                </button>
              ))}
            </div>
          )}

          {/* Drawer Body: Table Preview Rows Grid */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', backgroundColor: '#161922' }}>
            <TableRecordsViewer key={selectedTable} dbId={currentId} table={selectedTable} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Interactive Live Table Records Viewer Component ──
function TableRecordsViewer({ dbId, table }: { dbId: string; table: string }) {
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');

  const params = new URLSearchParams({
    table,
    limit: String(PREVIEW_LIMIT),
    offset: String(offset),
  });
  if (term) params.set('search', term);

  const preview = usePoll<DbQueryResult>(
    `/api/db/${encodeURIComponent(dbId)}/query?${params}`,
    0,
  );

  const page = Math.floor(offset / PREVIEW_LIMIT) + 1;
  const pages = preview.data ? Math.max(1, Math.ceil(preview.data.total / PREVIEW_LIMIT)) : 1;
  const canPrev = offset > 0;
  const canNext = preview.data?.hasMore ?? false;

  const jump = (next: number) => setOffset(Math.max(0, next));

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    setTerm(search.trim());
  };

  if (preview.loading && !preview.data) {
    return <Loading label={`Fetching records for table ${table}…`} />;
  }

  if (preview.error && !preview.data) {
    return <ErrorAlert error={preview.error} onRetry={preview.reload} />;
  }

  const data = preview.data;
  if (!data) return null;

  const columns = data.columns.map((c) => c.name);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Controls & Search */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <form onSubmit={submitSearch} style={{ display: 'flex', gap: 6, flex: 1, minWidth: 200 }}>
          <input
            placeholder="Filter rows (server-side LIKE)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              fontSize: '12px',
              height: 32,
              flex: 1,
              background: '#0d1117',
              color: '#ffffff',
              border: '1px solid #333d4e',
              borderRadius: '6px',
              padding: '0 10px',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '0 12px',
              height: 32,
              fontSize: '12px',
              fontWeight: 600,
              background: '#1f2430',
              color: '#ffffff',
              border: '1px solid #333d4e',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Filter
          </button>
          {term && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setTerm('');
                setOffset(0);
              }}
              style={{
                padding: '0 10px',
                height: 32,
                fontSize: '12px',
                background: 'transparent',
                color: '#94a3b8',
                border: '1px solid #333d4e',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            disabled={!canPrev}
            onClick={() => jump(offset - PREVIEW_LIMIT)}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              background: '#1f2430',
              color: canPrev ? '#ffffff' : '#64748b',
              border: '1px solid #333d4e',
              borderRadius: '6px',
              cursor: canPrev ? 'pointer' : 'not-allowed',
            }}
          >
            Prev
          </button>
          <span className="mono dim nowrap" style={{ fontSize: '11px', color: '#94a3b8' }}>
            {formatNumber(page)} / {formatNumber(pages)}
          </span>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => jump(offset + PREVIEW_LIMIT)}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              background: '#1f2430',
              color: canNext ? '#ffffff' : '#64748b',
              border: '1px solid #333d4e',
              borderRadius: '6px',
              cursor: canNext ? 'pointer' : 'not-allowed',
            }}
          >
            Next
          </button>
          {preview.loading && <span className="spinner" />}
        </div>
      </div>

      {/* Row count & masked info */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: '#94a3b8',
        }}
      >
        <span>
          Showing {formatNumber(data.rows.length)} of {formatNumber(data.total)} rows
        </span>
        {data.maskedColumns.length > 0 && (
          <span style={{ color: '#f59e0b', fontWeight: 500 }}>
            🔒 Masked: {data.maskedColumns.join(', ')}
          </span>
        )}
      </div>

      {/* Table Records Data Grid */}
      {data.rows.length === 0 ? (
        <Empty title="No records found">
          {term ? `No record in ${table} matches "${term}".` : 'This table is currently empty.'}
        </Empty>
      ) : (
        <div
          style={{
            border: '1px solid #333d4e',
            borderRadius: '8px',
            overflowX: 'auto',
            maxHeight: '520px',
            background: '#0d1117',
          }}
        >
          <table className="table" style={{ fontSize: '12px', width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#1f2430', zIndex: 10 }}>
              <tr>
                <th style={{ width: 40, textAlign: 'center', padding: '8px', borderBottom: '1px solid #333d4e', color: '#f8fafc' }}>#</th>
                {columns.map((col) => (
                  <th key={col} style={{ whiteSpace: 'nowrap', padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #333d4e', color: '#f8fafc' }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #1e2430' }}>
                  <td className="mono dim" style={{ textAlign: 'center', padding: '6px 8px', color: '#64748b' }}>
                    {formatNumber(offset + idx + 1)}
                  </td>
                  {columns.map((col) => (
                    <td
                      key={col}
                      className="mono truncate"
                      style={{ maxWidth: 220, padding: '6px 12px', color: '#e2e8f0' }}
                      title={String(row[col] ?? '')}
                    >
                      {renderCell(row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function renderCell(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return <span style={{ color: '#64748b', fontStyle: 'italic' }}>null</span>;
  }
  if (value === '<masked>') {
    return (
      <span
        style={{
          background: 'rgba(245, 158, 11, 0.2)',
          color: '#fbbf24',
          padding: '1px 6px',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 600,
        }}
      >
        &lt;masked&gt;
      </span>
    );
  }
  if (typeof value === 'boolean') {
    return (
      <span style={{ color: value ? '#3ecf8e' : '#f87171', fontWeight: 600 }}>
        {value ? 'true' : 'false'}
      </span>
    );
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}
