'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, LoaderCircle } from 'lucide-react';

import { AppSidebar } from '@/components/app-sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { createProject } from '@/utils/project-api';

export default function NewProjectPage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [description, setDescription] = useState('');
  const [design, setDesign] = useState('');
  const [rules, setRules] = useState('');

  const handleCreate = async () => {
    setError('');

    if (!name.trim() || !repoUrl.trim()) {
      setError('Name and repository URL are required');
      return;
    }

    try {
      setCreating(true);
      const project = await createProject({
        name: name.trim(),
        repoUrl: repoUrl.trim(),
        description: description.trim() || undefined,
        design: design.trim() || undefined,
        rules: rules.trim() || undefined,
      });
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/projects')}
            className="-ml-1"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <h1 className="text-lg font-semibold">New Project</h1>
          <div className="ml-auto">
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Create Project
            </Button>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-6 p-6 max-w-4xl">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid gap-6">
            <div className="grid gap-2">
              <Label htmlFor="name">
                Project Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Amazing App"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="repoUrl">
                Repository URL <span className="text-destructive">*</span>
              </Label>
              <Input
                id="repoUrl"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/username/repo"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of your project..."
                rows={3}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="design">Design Guidelines</Label>
              <Textarea
                id="design"
                value={design}
                onChange={(e) => setDesign(e.target.value)}
                placeholder="Architecture patterns, tech stack, design principles..."
                rows={6}
                className="font-mono text-sm"
              />
              <p className="text-sm text-muted-foreground">
                Describe the architecture, patterns, and technical design decisions
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="rules">Coding Rules</Label>
              <Textarea
                id="rules"
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                placeholder="Coding standards, naming conventions, best practices..."
                rows={6}
                className="font-mono text-sm"
              />
              <p className="text-sm text-muted-foreground">
                Define coding standards and rules for this project
              </p>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
