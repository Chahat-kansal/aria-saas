import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import { NextResponse } from 'next/server';
import mongoose, { Schema } from 'mongoose';

// Project model (inline to keep files organised)
export interface IProjectFile {
  name: string;
  path: string;
  content: string;
  language: string;
}

export interface IProject {
  _id: string;
  userId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  files: IProjectFile[];
  framework: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectFileSchema = new Schema<IProjectFile>({
  name: { type: String, required: true },
  path: { type: String, required: true },
  content: { type: String, default: '' },
  language: { type: String, default: 'text' },
});

const ProjectSchema = new Schema<IProject>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  files: [ProjectFileSchema],
  framework: { type: String, default: 'html' },
}, { timestamps: true });

const Project = mongoose.models.Project || mongoose.model<IProject>('Project', ProjectSchema);

// GET /api/project — list projects
// GET /api/project?id=xxx — get single project
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    const project = await Project.findOne({ _id: id, userId: (session.user as any).id });
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(project);
  }

  const projects = await Project.find({ userId: (session.user as any).id })
    .sort({ updatedAt: -1 })
    .select('_id name description framework updatedAt files');
  return NextResponse.json(projects);
}

// POST /api/project — create project
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();
  const { name, description, files, framework } = await req.json();

  if (!name?.trim()) return NextResponse.json({ error: 'Project name required' }, { status: 400 });

  const project = await Project.create({
    userId: (session.user as any).id,
    name: name.trim().slice(0, 100),
    description: description?.slice(0, 500) || '',
    files: files || [],
    framework: framework || 'html',
  });

  return NextResponse.json(project, { status: 201 });
}

// PUT /api/project — update project files
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();
  const { id, name, description, files, framework } = await req.json();

  if (!id) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const project = await Project.findOneAndUpdate(
    { _id: id, userId: (session.user as any).id },
    { $set: { name, description, files, framework } },
    { new: true }
  );

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(project);
}

// DELETE /api/project — delete project
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();
  const { id } = await req.json();
  await Project.deleteOne({ _id: id, userId: (session.user as any).id });
  return NextResponse.json({ success: true });
}
