
import React, { useState, useRef } from 'react';
import { Project } from '../types.ts';
import { EditIcon, DownloadIcon, ImageIcon } from './icons.tsx';
import { TrashIcon } from './icons/TrashIcon';
import { themeConfig } from '../themeConfig.ts';

interface ProjectsStudioProps {
    projects: Project[];
    activeProjectId: string | null;
    onSelectProject: (id: string) => void;
    onCreateProject: (data: { name: string; tagline?: string; thumbnail?: string }) => void;
    onRenameProject: (id: string, newName: string) => void;
    onDeleteProject: (id: string) => void;
}

const ProjectCard: React.FC<{
    project: Project;
    isActive: boolean;
    onSelect: () => void;
    onRename: (newName: string) => void;
    onDeleteRequest: () => void;
}> = ({ project, isActive, onSelect, onRename, onDeleteRequest }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(project.name);

    const handleRename = () => {
        if (name.trim() && name.trim() !== project.name) {
            onRename(name.trim());
        }
        setIsEditing(false);
    };

    const handleExport = () => {
        const dataStr = JSON.stringify(project, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_backup.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };
    
    return (
        <div 
            onClick={onSelect}
            className={`flex flex-col transition-all duration-300 group rounded-xl relative overflow-hidden cursor-pointer border ${
                isActive 
                    ? 'bg-surface border-brand shadow-[0_0_15px_rgba(37,99,235,0.3)]' 
                    : 'bg-secondary/50 border-accent hover:bg-surface hover:border-neutral-500/50'
            }`}
        >
            {/* Project Thumbnail Header */}
            <div className="h-40 w-full bg-neutral-950 relative overflow-hidden flex items-center justify-center border-b border-neutral-700/50">
                {project.thumbnail ? (
                    <img src={project.thumbnail} alt={project.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                    <div className="text-neutral-700 flex flex-col items-center">
                        <ImageIcon className="w-12 h-12 opacity-20" />
                    </div>
                )}
                {isActive && <div className="absolute top-2 right-2 bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg">ACTIVE</div>}
            </div>

            <div className="p-5 flex-grow flex flex-col">
                <div className="relative z-10">
                    {isEditing ? (
                         <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                            <input 
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-black border border-neutral-800 p-2 rounded-lg text-lg font-bold focus:ring-2 focus:ring-brand outline-none text-white"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleRename();
                                    if (e.key === 'Escape') setIsEditing(false);
                                }}
                            />
                            <div className="flex gap-2 justify-end">
                                 <button onClick={handleRename} className="text-xs bg-blue-600 text-white hover:bg-blue-500 px-3 py-1.5 rounded-lg font-bold">Save</button>
                                 <button onClick={() => setIsEditing(false)} className="text-xs bg-neutral-700 text-neutral-300 hover:bg-neutral-600 px-3 py-1.5 rounded-lg">Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className={`text-xl font-bold truncate pr-4 ${isActive ? 'text-white' : 'text-neutral-300'}`}>{project.name}</h3>
                                <p className="text-xs text-neutral-500 mt-1 font-mono">{project.id}</p>
                            </div>
                            
                            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setIsEditing(true); }} 
                                    title="Rename Project" 
                                    className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-md transition-colors"
                                >
                                    <EditIcon />
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleExport(); }} 
                                    title="Backup/Download Project" 
                                    className="p-2 text-neutral-400 hover:text-blue-400 hover:bg-neutral-700 rounded-md transition-colors"
                                >
                                    <DownloadIcon />
                                </button>
                                <div className="w-px h-4 bg-neutral-700 mx-1"></div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onDeleteRequest(); }} 
                                    title="Delete Project (Destructive)" 
                                    className="p-2 text-neutral-400 hover:text-red-400 hover:bg-red-900/20 rounded-md transition-colors"
                                >
                                   <TrashIcon />
                                </button>
                            </div>
                        </div>
                    )}
                    
                    {/* Tagline Section */}
                    <div className="mt-3 mb-4 min-h-[1.5rem]">
                        {project.tagline ? (
                            <p className="text-sm text-neutral-400 italic leading-relaxed line-clamp-2">"{project.tagline}"</p>
                        ) : (
                            <p className="text-xs text-neutral-600 italic">No tagline set.</p>
                        )}
                    </div>

                    <div className="pt-4 border-t border-neutral-700/50 flex justify-between items-center mt-auto">
                        <span className={`text-xs font-bold uppercase tracking-wider ${isActive ? 'text-blue-400' : 'text-neutral-600'}`}>
                            {isActive ? '● Online' : '○ Offline'}
                        </span>
                        {!isActive && (
                            <span className="text-xs text-neutral-500 group-hover:text-blue-400 transition-colors">Click to Load &rarr;</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export const ProjectsStudio: React.FC<ProjectsStudioProps> = ({ projects, activeProjectId, onSelectProject, onCreateProject, onRenameProject, onDeleteProject }) => {
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectTagline, setNewProjectTagline] = useState('');
    const [newProjectThumbnail, setNewProjectThumbnail] = useState<string | undefined>(undefined);
    const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleThumbnailUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setNewProjectThumbnail(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        if (newProjectName.trim()) {
            onCreateProject({
                name: newProjectName.trim(),
                tagline: newProjectTagline.trim(),
                thumbnail: newProjectThumbnail
            });
            // Reset Form
            setNewProjectName('');
            setNewProjectTagline('');
            setNewProjectThumbnail(undefined);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const confirmDelete = () => {
        if (projectToDelete) {
            onDeleteProject(projectToDelete);
            setProjectToDelete(null);
        }
    };
    
    return (
        <div className={themeConfig.layout.studioContainer}>
            <div className="mb-8">
                <h2 className={themeConfig.typography.pageTitle}>Projects</h2>
                <p className={themeConfig.typography.pageSubtitle}>Manage your productions. Each project contains its own separate universe of images, scripts, characters, and settings.</p>
            </div>

            <div className={themeConfig.cards.elevated}>
                <h3 className={themeConfig.typography.sectionHeader + " mb-4"}>Start New Production</h3>
                <form onSubmit={handleCreate} className="flex flex-col md:flex-row gap-6">
                    {/* Thumbnail Input */}
                    <div 
                        className="w-full md:w-48 h-32 bg-black border-2 border-dashed border-neutral-800 rounded-xl flex items-center justify-center cursor-pointer hover:border-brand hover:bg-neutral-900 transition-all relative overflow-hidden group shrink-0"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        {newProjectThumbnail ? (
                            <>
                                <img src={newProjectThumbnail} alt="Preview" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="text-xs text-white font-bold">Change</span>
                                </div>
                            </>
                        ) : (
                            <div className="text-center p-2">
                                <ImageIcon className="w-6 h-6 mx-auto text-neutral-600 mb-1" />
                                <span className="text-xs text-neutral-500 block">Add Poster</span>
                            </div>
                        )}
                        <input 
                            ref={fileInputRef} 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={handleThumbnailUpload} 
                        />
                    </div>

                    {/* Text Inputs */}
                    <div className="flex-grow flex flex-col gap-4">
                        <input
                            type="text"
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            placeholder="Project Title (e.g. Cyberpunk Noir Feature)..."
                            className={themeConfig.forms.input}
                        />
                        <input
                            type="text"
                            value={newProjectTagline}
                            onChange={(e) => setNewProjectTagline(e.target.value)}
                            placeholder="Short Tagline (e.g. A detective story set in 2049)..."
                            className={themeConfig.forms.input}
                        />
                        <div className="flex justify-end pt-2">
                            <button
                                type="submit"
                                disabled={!newProjectName.trim()}
                                className={themeConfig.buttons.primary}
                            >
                                Create Production
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            <div className="space-y-4">
                {projects.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {projects.map(project => (
                            <ProjectCard
                                key={project.id}
                                project={project}
                                isActive={project.id === activeProjectId}
                                onSelect={() => onSelectProject(project.id)}
                                onRename={(newName) => onRenameProject(project.id, newName)}
                                onDeleteRequest={() => setProjectToDelete(project.id)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-[40vh] border-2 border-dashed border-neutral-800 rounded-xl bg-neutral-900/30 text-center p-8">
                         <div className="w-16 h-16 text-neutral-700 mb-4 opacity-50">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                         </div>
                        <h3 className="text-xl font-bold text-neutral-300 mb-2">No Projects Found</h3>
                        <p className={themeConfig.typography.bodyMuted + " max-w-xs mx-auto text-center"}>Create your first project above to begin your creative journey.</p>
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {projectToDelete && (
                <div className={themeConfig.forms.modalOverlay}>
                    <div className={themeConfig.forms.modalDialog + " p-6"}>
                        <div className="absolute top-0 left-0 w-full h-1 bg-red-600"></div>
                        <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                            <TrashIcon className="w-6 h-6 text-red-500" />
                            Delete Project?
                        </h3>
                        <p className={themeConfig.typography.bodyMuted + " mb-6"}>
                            Are you sure you want to delete this project? This will <strong className="text-white">permanently remove</strong> all associated scripts, images, lore, and characters. This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button 
                                onClick={() => setProjectToDelete(null)}
                                className={themeConfig.buttons.secondary}
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={confirmDelete}
                                className={themeConfig.buttons.danger}
                            >
                                Confirm Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
