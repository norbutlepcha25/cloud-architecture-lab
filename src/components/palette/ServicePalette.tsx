import React, { useState, useMemo, useId } from 'react';
import { AWS_SERVICES } from '../../data/serviceCatalog.ts';
import { useArchitecture } from '../../context/ArchitectureContext.tsx';
import { AwsServiceIcon } from '../icons/AwsServiceIcons.tsx';
import {
  Search,
  Plus,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { ServiceInfoModal } from './ServiceInfoModal.tsx';

const CATEGORY_COLORS: Record<string, string> = {
  'Compute': '#ED7100',
  'Storage': '#7AA116',
  'Databases': '#C925D1',
  'Networking & Content Delivery': '#8C4FFF',
  'Security, Identity & Compliance': '#DD344C',
  'Integration & Messaging': '#FF4F8B',
  'Analytics': '#2E27AD',
  'Machine Learning & AI': '#059669',
  'Management & Governance': '#E7157B',
  'Developer Tools': '#2563EB',
  'Containers': '#ED7100',
  'Frontend Web & Mobile': '#D97706',
  'Migration & Transfer': '#0891B2',
  'Media Services': '#B91C1C',
  'Business Applications': '#0284C7',
  'End User Computing': '#7C3AED',
  'Internet of Things (IoT)': '#65A30D',
  'Cloud Financial Management': '#15803D',
  'Blockchain & Quantum': '#4338CA',
  'Robotics & Satellite': '#0F766E',
  'Client / Ingress': '#232F3E'
};

interface BoundaryDef {
  id: string;
  name: string;
  boundaryType: 'vpc' | 'public_subnet' | 'private_subnet' | 'az' | 'region' | 'security_group' | 'account';
  subtitle: string;
  description: string;
  badgeLabel: string;
  badgeBg: string;
  textColor: string;
  borderColor: string;
  cardBg: string;
  iconType: 'cloud' | 'lock' | 'flag' | 'sg' | 'az';
  dashed?: boolean;
}

const BOUNDARY_DEFINITIONS: BoundaryDef[] = [
  {
    id: 'vpc',
    name: 'Amazon VPC',
    boundaryType: 'vpc',
    subtitle: 'Virtual Private Cloud',
    description: 'Logically isolated virtual network. Encloses subnets, route tables, and gateways.',
    badgeLabel: 'VPC',
    badgeBg: '#8C4FFF',
    textColor: '#545B64',
    borderColor: '#8C4FFF',
    cardBg: '#FFFFFF',
    iconType: 'cloud'
  },
  {
    id: 'public_subnet',
    name: 'Public Subnet',
    boundaryType: 'public_subnet',
    subtitle: 'Web / DMZ Tier',
    description: 'Subnet with route to Internet Gateway. Encloses ALBs, Web EC2 instances, and NAT Gateways.',
    badgeLabel: 'Public subnet',
    badgeBg: '#7AA116',
    textColor: '#4B6610',
    borderColor: '#7AA116',
    cardBg: '#EEF7E8',
    iconType: 'lock'
  },
  {
    id: 'private_subnet',
    name: 'Private Subnet',
    boundaryType: 'private_subnet',
    subtitle: 'Database / App Tier',
    description: 'Isolated subnet without public route. Protects RDS databases, backend microservices, and caches.',
    badgeLabel: 'Private subnet',
    badgeBg: '#00A4A6',
    textColor: '#00797B',
    borderColor: '#00A4A6',
    cardBg: '#EEF6FC',
    iconType: 'lock'
  },
  {
    id: 'az',
    name: 'Availability Zone',
    boundaryType: 'az',
    subtitle: 'AZ Boundary',
    description: 'Distinct, physically isolated data centers with independent power and redundant connectivity.',
    badgeLabel: 'Availability Zone',
    badgeBg: 'transparent',
    textColor: '#0073BB',
    borderColor: '#0073BB',
    cardBg: '#FFFFFF',
    iconType: 'az',
    dashed: true
  },
  {
    id: 'security_group',
    name: 'Security Group',
    boundaryType: 'security_group',
    subtitle: 'Virtual Firewall Tier',
    description: 'Stateful virtual firewall boundary spanning instances across AZs to filter inbound/outbound ports.',
    badgeLabel: 'Security group',
    badgeBg: 'transparent',
    textColor: '#EF4444',
    borderColor: '#EF4444',
    cardBg: '#FFFFFF',
    iconType: 'sg'
  },
  {
    id: 'region',
    name: 'AWS Region',
    boundaryType: 'region',
    subtitle: 'Regional Perimeter',
    description: 'Physical geographic boundary (e.g. us-east-1) enclosing all AZs, VPCs, and S3 resources.',
    badgeLabel: 'Region',
    badgeBg: '#0073BB',
    textColor: '#0073BB',
    borderColor: '#0073BB',
    cardBg: '#FFFFFF',
    iconType: 'flag'
  },
  {
    id: 'account',
    name: 'AWS Account',
    boundaryType: 'account',
    subtitle: 'Account Boundary',
    description: 'Top-level isolation boundary separating customer workloads from managed AWS or partner accounts.',
    badgeLabel: "Customer's AWS Account",
    badgeBg: '#232F3E',
    textColor: '#232F3E',
    borderColor: '#232F3E',
    cardBg: '#FFFFFF',
    iconType: 'cloud'
  }
];

export const ServicePalette: React.FC = () => {
  const { addServiceNode, addBoundaryNode } = useArchitecture();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const contentId = useId();
  const [activeTab, setActiveTab] = useState<'services' | 'boundaries'>('services');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('All');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [infoModalServiceId, setInfoModalServiceId] = useState<string | null>(null);

  // Extract list of all unique categories
  const allCategoryNames = useMemo(() => {
    const cats = Array.from(new Set(AWS_SERVICES.map(s => s.category)));
    return ['All', ...cats];
  }, []);

  // Filter services by category filter & search query
  const filteredServices = useMemo(() => {
    let result = AWS_SERVICES;

    if (selectedCategoryFilter !== 'All') {
      result = result.filter(s => s.category === selectedCategoryFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        s =>
          s.name.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.architecturalRole.toLowerCase().includes(q)
      );
    }
    return result;
  }, [searchQuery, selectedCategoryFilter]);

  // Group filtered services by category
  const categories = useMemo(() => {
    const groups: Record<string, typeof AWS_SERVICES> = {};
    for (const service of filteredServices) {
      if (!groups[service.category]) {
        groups[service.category] = [];
      }
      groups[service.category].push(service);
    }
    return groups;
  }, [filteredServices]);

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const expandAll = () => {
    setCollapsedCategories({});
  };

  const collapseAll = () => {
    const allCollapsed: Record<string, boolean> = {};
    for (const cat of Object.keys(categories)) {
      allCollapsed[cat] = true;
    }
    setCollapsedCategories(allCollapsed);
  };

  const onDragStartService = (event: React.DragEvent, serviceId: string) => {
    event.dataTransfer.setData('application/aws-service-id', serviceId);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragStartBoundary = (event: React.DragEvent, boundaryType: string) => {
    event.dataTransfer.setData('application/aws-boundary-type', boundaryType);
    event.dataTransfer.effectAllowed = 'move';
  };

  // Check if search query matches any network boundary
  const matchingBoundaries = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return BOUNDARY_DEFINITIONS.filter(
      b => b.name.toLowerCase().includes(q) || b.description.toLowerCase().includes(q) || b.boundaryType.includes(q)
    );
  }, [searchQuery]);

  return (
    <aside aria-label="AWS service palette" className={`${isCollapsed ? 'w-12' : 'w-72'} bg-white border-r border-slate-200 flex flex-col h-full flex-shrink-0 select-none z-10`}>
      <div className={`flex items-center border-b border-slate-200 ${isCollapsed ? 'justify-center' : 'justify-between pl-3'}`}>
        {!isCollapsed && <span className="text-xs font-semibold text-slate-700">Service library</span>}
        <button
          type="button"
          aria-label={isCollapsed ? 'Expand services sidebar' : 'Collapse services sidebar'}
          title={isCollapsed ? 'Expand services sidebar' : 'Collapse services sidebar'}
          aria-expanded={!isCollapsed}
          aria-controls={contentId}
          onClick={() => setIsCollapsed(previous => !previous)}
          className="w-11 h-11 shrink-0 flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-circuit-600"
        >
          {isCollapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
        </button>
      </div>
      <div id={contentId} hidden={isCollapsed} className={isCollapsed ? 'hidden' : 'flex flex-col flex-1 min-h-0'}>
      {/* Top Tab Switcher: Services vs VPC & Boundaries */}
      <div className="flex border-b border-slate-200 bg-white text-xs font-medium">
        <button
          onClick={() => setActiveTab('services')}
          className={`flex-1 py-2 border-b-2 transition-colors ${
            activeTab === 'services'
              ? 'border-circuit-600 text-slate-900 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Services ({AWS_SERVICES.length})
        </button>

        <button
          onClick={() => setActiveTab('boundaries')}
          className={`flex-1 py-2 border-b-2 transition-colors ${
            activeTab === 'boundaries'
              ? 'border-circuit-600 text-slate-900 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          VPC & Groups ({BOUNDARY_DEFINITIONS.length})
        </button>
      </div>

      {activeTab === 'boundaries' ? (
        /* =================== VPC & BOUNDARIES PALETTE =================== */
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 custom-scrollbar">
          <div className="divide-y divide-slate-100 -mx-1">
            {BOUNDARY_DEFINITIONS.map((boundary) => (
              <div
                key={boundary.id}
                draggable
                onDragStart={(e) => onDragStartBoundary(e, boundary.boundaryType)}
                onClick={() => addBoundaryNode(boundary.boundaryType)}
                title={boundary.description}
                className="group flex items-start gap-2.5 px-1 py-2 cursor-grab active:cursor-grabbing"
              >
                {/* Color swatch - matches the boundary's actual on-canvas border color */}
                <span
                  className={`mt-1 w-2.5 h-2.5 flex-shrink-0 ${boundary.dashed ? 'border border-dashed' : 'border'}`}
                  style={{ borderColor: boundary.borderColor, backgroundColor: boundary.badgeBg !== 'transparent' ? boundary.borderColor : 'transparent' }}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900">
                      {boundary.name}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        addBoundaryNode(boundary.boundaryType);
                      }}
                      title="Add to canvas"
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-900 transition-opacity flex-shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-[10px] text-slate-500">{boundary.subtitle}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* =================== SERVICES PALETTE =================== */
        <>
          {/* Header & Search */}
          <div className="p-3 border-b border-slate-200 bg-white space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-600">
                AWS services <span className="text-slate-400 font-normal">({filteredServices.length})</span>
              </h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={expandAll}
                  title="Expand all categories"
                  className="text-[10px] text-slate-500 hover:text-slate-800 px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors"
                >
                  Expand
                </button>
                <span className="text-slate-300">|</span>
                <button
                  onClick={collapseAll}
                  title="Collapse all categories"
                  className="text-[10px] text-slate-500 hover:text-slate-800 px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors"
                >
                  Collapse
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search 300+ AWS services..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-white border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400 transition-colors"
              />
            </div>

            {/* If searching for VPC / Subnet, show helpful shortcut */}
            {matchingBoundaries.length > 0 && (
              <button
                onClick={() => setActiveTab('boundaries')}
                className="w-full text-left px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-medium flex items-center justify-between hover:bg-slate-100 transition-colors"
              >
                <span>Found {matchingBoundaries.length} boundary containers</span>
                <span className="text-[10px] font-medium text-slate-600 underline">View &rarr;</span>
              </button>
            )}

            {/* Category Quick Filter Dropdown */}
            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              aria-label="Filter by AWS Category"
              className="w-full text-[11px] py-1 px-2 rounded-md bg-white border border-slate-200 text-slate-700 font-medium focus:outline-none focus:border-slate-400 transition-colors cursor-pointer"
            >
              {allCategoryNames.map((cat) => {
                const count = cat === 'All' ? AWS_SERVICES.length : AWS_SERVICES.filter(s => s.category === cat).length;
                return (
                  <option key={cat} value={cat}>
                    {cat} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Services List */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-3 custom-scrollbar bg-white">
            {Object.entries(categories).map(([category, services]) => {
              const isCollapsed = !!collapsedCategories[category];

              return (
                <div key={category} className="space-y-1">
                  {/* Category Header */}
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center justify-between text-left px-2 py-1 rounded-md hover:bg-slate-100 text-slate-700 font-medium transition-colors group"
                  >
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-[11px] tracking-tight truncate font-semibold text-slate-800">
                        {category}
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        ({services.length})
                      </span>
                    </div>
                    <span className="text-slate-400 group-hover:text-slate-600 flex-shrink-0">
                      {isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </span>
                  </button>

                  {/* Service Items */}
                  {!isCollapsed && (
                    <div className="pl-1 divide-y divide-slate-50">
                      {services.map((service) => {
                        const isSelected = selectedServiceId === service.id;
                        return (
                          <div
                            key={service.id}
                            draggable
                            onDragStart={(e) => onDragStartService(e, service.id)}
                            onClick={() => setSelectedServiceId(prev => prev === service.id ? null : service.id)}
                            className={`group flex items-center gap-2.5 py-1.5 pl-1.5 pr-1 cursor-grab active:cursor-grabbing ${
                              isSelected ? 'bg-circuit-50/60' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex-shrink-0">
                              <AwsServiceIcon serviceId={service.id} size={28} />
                            </div>
                            <div className="flex-1 overflow-hidden">
                              <div className="text-xs font-semibold text-slate-900 truncate">
                                {service.name}
                              </div>
                              <div className="text-[10px] text-slate-500 truncate leading-tight">
                                {service.category}
                              </div>
                            </div>

                            <div className={`flex items-center gap-2.5 flex-shrink-0 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setInfoModalServiceId(service.id);
                                }}
                                title={`View ${service.name} details & storage classes`}
                                className="text-[11px] font-medium text-circuit-700 hover:underline"
                              >
                                Info
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addServiceNode(service.id);
                                }}
                                title="Add to canvas"
                                className="text-slate-400 hover:text-slate-900 transition-colors"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredServices.length === 0 && (
              <div className="p-4 text-center text-xs text-slate-500">
                No matching AWS services found.
              </div>
            )}
          </div>
        </>
      )}

      </div>

      {/* Service Architectural Info & Notes Modal Overlay */}
      {infoModalServiceId && (
        <ServiceInfoModal
          serviceId={infoModalServiceId}
          onClose={() => setInfoModalServiceId(null)}
          onAddToCanvas={addServiceNode}
        />
      )}
    </aside>
  );
};
