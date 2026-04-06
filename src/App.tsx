import React, { useState, useEffect } from 'react';
import { auth, googleProvider, signInWithPopup, signOut, db, onSnapshot, collection, query, where, orderBy, OperationType, handleFirestoreError, addDoc, deleteDoc, doc } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Layout, Plus, Folder, Image as ImageIcon, Download, Trash2, ChevronRight, LogOut, Wand2, Loader2, Save, X, Printer, FileDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateColoringPage } from './lib/gemini';
import { jsPDF } from 'jspdf';
import confetti from 'canvas-confetti';

// --- Types ---
interface Project {
  id: string;
  name: string;
  userId: string;
  folderId?: string;
  createdAt: any;
  updatedAt?: any;
}

interface Page {
  id: string;
  projectId: string;
  prompt: string;
  imageUrl: string;
  createdAt: any;
  difficulty: string;
  category: string;
}

interface FolderType {
  id: string;
  name: string;
  userId: string;
  createdAt: any;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'generate' | 'projects' | 'folders'>('generate');
  const [projects, setProjects] = useState<Project[]>([]);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  
  // Generator State
  const [prompt, setPrompt] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [category, setCategory] = useState('Animals');
  const [generating, setGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [batchCount, setBatchCount] = useState(1);
  const [batchProgress, setBatchProgress] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;

    const qProjects = query(collection(db, 'projects'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubProjects = onSnapshot(qProjects, (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'projects'));

    const qFolders = query(collection(db, 'folders'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubFolders = onSnapshot(qFolders, (snapshot) => {
      setFolders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FolderType)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'folders'));

    return () => {
      unsubProjects();
      unsubFolders();
    };
  }, [user]);

  useEffect(() => {
    if (!selectedProject) {
      setPages([]);
      return;
    }

    const qPages = query(collection(db, `projects/${selectedProject.id}/pages`), orderBy('createdAt', 'desc'));
    const unsubPages = onSnapshot(qPages, (snapshot) => {
      setPages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Page)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `projects/${selectedProject.id}/pages`));

    return unsubPages;
  }, [selectedProject]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleGenerate = async () => {
    if (!prompt) return;
    setGenerating(true);
    setBatchProgress(0);
    setGeneratedImage(null);

    try {
      const images: string[] = [];
      for (let i = 0; i < batchCount; i++) {
        const img = await generateColoringPage(prompt, difficulty, category);
        images.push(img);
        setBatchProgress(((i + 1) / batchCount) * 100);
        if (batchCount === 1) setGeneratedImage(img);
      }

      if (batchCount > 1) {
        // Auto-create project for batch
        const projectName = `${prompt} (${new Date().toLocaleDateString()})`;
        const projectRef = await addDoc(collection(db, 'projects'), {
          name: projectName,
          userId: user?.uid,
          createdAt: new Date(),
        });
        
        for (const img of images) {
          await addDoc(collection(db, `projects/${projectRef.id}/pages`), {
            projectId: projectRef.id,
            prompt,
            imageUrl: img,
            createdAt: new Date(),
            difficulty,
            category
          });
        }
        confetti();
        setActiveTab('projects');
      }
    } catch (error) {
      console.error("Generation failed", error);
    } finally {
      setGenerating(false);
    }
  };

  const saveToProject = async (img: string) => {
    if (!user) return;
    try {
      let projectId = selectedProject?.id;
      if (!projectId) {
        const res = await addDoc(collection(db, 'projects'), {
          name: `My Coloring Book ${new Date().toLocaleDateString()}`,
          userId: user.uid,
          createdAt: new Date(),
        });
        projectId = res.id;
      }
      
      await addDoc(collection(db, `projects/${projectId}/pages`), {
        projectId,
        prompt,
        imageUrl: img,
        createdAt: new Date(),
        difficulty,
        category
      });
      confetti();
      setGeneratedImage(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'pages');
    }
  };

  const downloadPDF = (projectPages: Page[], name: string) => {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'in',
      format: [8.5, 11]
    });

    projectPages.forEach((page, index) => {
      if (index > 0) pdf.addPage();
      // 0.25" margin
      pdf.addImage(page.imageUrl, 'PNG', 0.25, 0.25, 8, 10.5);
    });

    pdf.save(`${name}.pdf`);
  };

  const deleteProject = async (id: string) => {
    if (!confirm("Delete this project and all its pages?")) return;
    try {
      await deleteDoc(doc(db, 'projects', id));
      if (selectedProject?.id === id) setSelectedProject(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'projects');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-yellow-50">
        <Loader2 className="w-12 h-12 text-yellow-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-yellow-50 flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white p-12 rounded-3xl shadow-2xl max-w-lg w-full border-4 border-yellow-200"
        >
          <div className="w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-8">
            <Wand2 className="w-12 h-12 text-yellow-600" />
          </div>
          <h1 className="text-4xl font-black text-gray-900 mb-4 tracking-tight">ColoringAI</h1>
          <p className="text-xl text-gray-600 mb-10 leading-relaxed">
            Create magical coloring books for your kids in seconds. 
            Safe, simple, and infinitely creative.
          </p>
          <button
            onClick={handleLogin}
            className="w-full py-4 bg-yellow-400 hover:bg-yellow-500 text-yellow-950 font-bold text-xl rounded-2xl shadow-lg transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-yellow-400 rounded-xl flex items-center justify-center shadow-sm">
              <Wand2 className="w-6 h-6 text-yellow-950" />
            </div>
            <span className="text-2xl font-black text-gray-900 tracking-tight">ColoringAI</span>
          </div>
          
          <nav className="space-y-2">
            <SidebarItem 
              icon={<Plus className="w-5 h-5" />} 
              label="New Page" 
              active={activeTab === 'generate'} 
              onClick={() => { setActiveTab('generate'); setSelectedProject(null); }} 
            />
            <SidebarItem 
              icon={<Layout className="w-5 h-5" />} 
              label="My Projects" 
              active={activeTab === 'projects'} 
              onClick={() => setActiveTab('projects')} 
            />
            <SidebarItem 
              icon={<Folder className="w-5 h-5" />} 
              label="Folders" 
              active={activeTab === 'folders'} 
              onClick={() => setActiveTab('folders')} 
            />
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-4 mb-4">Recent Projects</h3>
          <div className="space-y-1">
            {projects.slice(0, 5).map(p => (
              <button
                key={p.id}
                onClick={() => { setSelectedProject(p); setActiveTab('projects'); }}
                className={`w-full text-left px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${selectedProject?.id === p.id ? 'bg-yellow-50 text-yellow-700' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <ImageIcon className="w-4 h-4 opacity-50" />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-2xl mb-4">
            <img src={user.photoURL || ''} className="w-8 h-8 rounded-full border border-gray-200" alt="User" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{user.displayName}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-8">
          <AnimatePresence mode="wait">
            {activeTab === 'generate' && (
              <motion.div
                key="generate"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
                  <h2 className="text-3xl font-black text-gray-900 mb-2">Create Magic</h2>
                  <p className="text-gray-500 mb-8">Describe what you want to color today!</p>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">The Prompt</label>
                        <textarea
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          placeholder="e.g., A cute baby dragon sitting on a cloud..."
                          className="w-full h-32 p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-yellow-400 focus:ring-0 transition-all resize-none text-lg"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-2">Difficulty</label>
                          <select 
                            value={difficulty}
                            onChange={(e) => setDifficulty(e.target.value)}
                            className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-yellow-400 focus:ring-0 transition-all"
                          >
                            <option value="simple">Simple (Ages 3-5)</option>
                            <option value="medium">Medium (Ages 6-8)</option>
                            <option value="detailed">Detailed (Ages 9+)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-2">Category</label>
                          <select 
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-yellow-400 focus:ring-0 transition-all"
                          >
                            <option>Animals</option>
                            <option>Fantasy</option>
                            <option>Vehicles</option>
                            <option>Nature</option>
                            <option>Educational</option>
                            <option>Space</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Batch Size (1-10)</label>
                        <div className="flex items-center gap-4">
                          <input 
                            type="range" 
                            min="1" 
                            max="10" 
                            value={batchCount}
                            onChange={(e) => setBatchCount(parseInt(e.target.value))}
                            className="flex-1 accent-yellow-400"
                          />
                          <span className="text-xl font-black text-yellow-600 w-8">{batchCount}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">Batch generation automatically creates a new project.</p>
                      </div>

                      <button
                        onClick={handleGenerate}
                        disabled={generating || !prompt}
                        className="w-full py-5 bg-yellow-400 hover:bg-yellow-500 disabled:bg-gray-100 disabled:text-gray-400 text-yellow-950 font-black text-xl rounded-2xl shadow-lg transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3"
                      >
                        {generating ? (
                          <>
                            <Loader2 className="w-6 h-6 animate-spin" />
                            Generating {batchCount > 1 ? `${Math.round(batchProgress)}%` : '...'}
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-6 h-6" />
                            Generate {batchCount > 1 ? `${batchCount} Pages` : 'Page'}
                          </>
                        )}
                      </button>
                    </div>

                    <div className="bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center p-8 relative overflow-hidden min-h-[400px]">
                      {generatedImage ? (
                        <div className="space-y-6 w-full">
                          <img 
                            src={generatedImage} 
                            className="w-full aspect-[3/4] object-contain bg-white rounded-xl shadow-lg border border-gray-200" 
                            alt="Generated" 
                          />
                          <div className="flex gap-3">
                            <button 
                              onClick={() => saveToProject(generatedImage)}
                              className="flex-1 py-3 bg-white border-2 border-yellow-400 text-yellow-700 font-bold rounded-xl hover:bg-yellow-50 transition-colors flex items-center justify-center gap-2"
                            >
                              <Save className="w-5 h-5" />
                              Save to Book
                            </button>
                            <button 
                              onClick={() => {
                                const link = document.createElement('a');
                                link.href = generatedImage;
                                link.download = `${prompt}.png`;
                                link.click();
                              }}
                              className="p-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors"
                            >
                              <Download className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center space-y-4">
                          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm">
                            <ImageIcon className="w-10 h-10 text-gray-300" />
                          </div>
                          <p className="text-gray-400 font-medium">Your masterpiece will appear here</p>
                        </div>
                      )}
                      
                      {generating && (
                        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center p-12 text-center">
                          <Loader2 className="w-12 h-12 text-yellow-500 animate-spin mb-4" />
                          <h3 className="text-xl font-bold text-gray-900 mb-2">Mixing the colors...</h3>
                          <p className="text-gray-500">Our AI is drawing your request with perfect lines.</p>
                          {batchCount > 1 && (
                            <div className="w-full max-w-xs bg-gray-100 h-2 rounded-full mt-6 overflow-hidden">
                              <motion.div 
                                className="h-full bg-yellow-400" 
                                initial={{ width: 0 }}
                                animate={{ width: `${batchProgress}%` }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'projects' && (
              <motion.div
                key="projects"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-8"
              >
                {selectedProject ? (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={() => setSelectedProject(null)}
                          className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                        >
                          <ChevronRight className="w-6 h-6 rotate-180" />
                        </button>
                        <div>
                          <h2 className="text-3xl font-black text-gray-900">{selectedProject.name}</h2>
                          <p className="text-gray-500">{pages.length} pages in this book</p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button 
                          onClick={() => downloadPDF(pages, selectedProject.name)}
                          disabled={pages.length === 0}
                          className="px-6 py-3 bg-yellow-400 hover:bg-yellow-500 disabled:bg-gray-100 disabled:text-gray-400 text-yellow-950 font-bold rounded-2xl shadow-md transition-all flex items-center gap-2"
                        >
                          <FileDown className="w-5 h-5" />
                          Download PDF Book
                        </button>
                        <button 
                          onClick={() => deleteProject(selectedProject.id)}
                          className="p-3 text-red-600 hover:bg-red-50 rounded-2xl transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                      {pages.map(page => (
                        <div key={page.id} className="group relative bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all">
                          <img src={page.imageUrl} className="w-full aspect-[3/4] object-contain p-4" alt={page.prompt} />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <button 
                              onClick={() => {
                                const link = document.createElement('a');
                                link.href = page.imageUrl;
                                link.download = `${page.prompt}.png`;
                                link.click();
                              }}
                              className="p-3 bg-white text-gray-900 rounded-xl hover:bg-gray-100 transition-colors"
                            >
                              <Download className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={async () => {
                                if (confirm("Delete this page?")) {
                                  await deleteDoc(doc(db, `projects/${selectedProject.id}/pages`, page.id));
                                }
                              }}
                              className="p-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                          <div className="p-3 bg-gray-50 border-t border-gray-100">
                            <p className="text-xs font-bold text-gray-900 truncate">{page.prompt}</p>
                            <p className="text-[10px] text-gray-400 uppercase tracking-tighter">{page.difficulty} • {page.category}</p>
                          </div>
                        </div>
                      ))}
                      <button 
                        onClick={() => setActiveTab('generate')}
                        className="aspect-[3/4] border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-3 text-gray-400 hover:border-yellow-400 hover:text-yellow-500 hover:bg-yellow-50 transition-all"
                      >
                        <Plus className="w-8 h-8" />
                        <span className="font-bold">Add Page</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="flex items-center justify-between">
                      <h2 className="text-3xl font-black text-gray-900">My Coloring Books</h2>
                      <button 
                        onClick={async () => {
                          const name = prompt("Enter book name:");
                          if (name) {
                            await addDoc(collection(db, 'projects'), {
                              name,
                              userId: user.uid,
                              createdAt: new Date(),
                            });
                          }
                        }}
                        className="px-6 py-3 bg-white border-2 border-gray-100 hover:border-yellow-400 text-gray-700 font-bold rounded-2xl shadow-sm transition-all flex items-center gap-2"
                      >
                        <Plus className="w-5 h-5" />
                        New Book
                      </button>
                    </div>

                    {projects.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {projects.map(p => (
                          <button
                            key={p.id}
                            onClick={() => setSelectedProject(p)}
                            className="group bg-white p-6 rounded-3xl shadow-sm border border-gray-100 hover:shadow-xl hover:border-yellow-200 transition-all text-left relative overflow-hidden"
                          >
                            <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-50 rounded-bl-full -mr-8 -mt-8 group-hover:bg-yellow-100 transition-colors" />
                            <div className="relative z-10">
                              <div className="w-12 h-12 bg-yellow-100 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <ImageIcon className="w-6 h-6 text-yellow-600" />
                              </div>
                              <h3 className="text-xl font-black text-gray-900 mb-1 truncate">{p.name}</h3>
                              <p className="text-sm text-gray-400 font-medium">Created {new Date(p.createdAt?.seconds * 1000).toLocaleDateString()}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-gray-100">
                        <Layout className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-gray-900 mb-2">No books yet</h3>
                        <p className="text-gray-400 mb-8">Start by generating a page or creating a new book!</p>
                        <button 
                          onClick={() => setActiveTab('generate')}
                          className="px-8 py-3 bg-yellow-400 text-yellow-950 font-bold rounded-2xl shadow-lg hover:bg-yellow-500 transition-all"
                        >
                          Create My First Page
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'folders' && (
              <div className="text-center py-20">
                <Folder className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">Folders coming soon!</h3>
                <p className="text-gray-400">We're working on better ways to organize your art.</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${active ? 'bg-yellow-400 text-yellow-950 shadow-md' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}
    >
      {icon}
      {label}
    </button>
  );
}
