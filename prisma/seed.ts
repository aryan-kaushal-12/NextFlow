import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding sample workflow: Product Marketing Kit Generator…');

  // ── Node positions ──────────────────────────────────────────────────────────
  // Branch A: Upload Image → Crop Image → Text (sys) + Text (details) → LLM #1
  // Branch B: Upload Video → Extract Frame
  // Convergence: LLM #2

  const nodes = [
    // ── Branch A ──
    {
      id: 'upload-image-1',
      type: 'uploadImageNode',
      position: { x: 60, y: 80 },
      data: { label: 'Product Photo' },
    },
    {
      id: 'crop-image-1',
      type: 'cropImageNode',
      position: { x: 360, y: 80 },
      data: {
        label: 'Crop to Product',
        x_percent: 10,
        y_percent: 10,
        width_percent: 80,
        height_percent: 80,
      },
    },
    {
      id: 'text-sys-prompt',
      type: 'textNode',
      position: { x: 360, y: 340 },
      data: {
        label: 'System Prompt',
        text: 'You are a professional marketing copywriter. Generate a compelling one-paragraph product description.',
      },
    },
    {
      id: 'text-product-details',
      type: 'textNode',
      position: { x: 360, y: 520 },
      data: {
        label: 'Product Details',
        text: 'Product: Wireless Bluetooth Headphones. Features: Noise cancellation, 30-hour battery, foldable design.',
      },
    },
    {
      id: 'llm-1',
      type: 'llmNode',
      position: { x: 700, y: 200 },
      data: {
        label: 'Product Description LLM',
        model: 'openai:gpt-4o-mini',
      },
    },

    // ── Branch B ──
    {
      id: 'upload-video-1',
      type: 'uploadVideoNode',
      position: { x: 60, y: 700 },
      data: { label: 'Product Demo Video' },
    },
    {
      id: 'extract-frame-1',
      type: 'extractFrameNode',
      position: { x: 360, y: 700 },
      data: {
        label: 'Extract Mid Frame',
        timestamp: '50%',
      },
    },

    // ── Convergence ──
    {
      id: 'text-social-prompt',
      type: 'textNode',
      position: { x: 700, y: 700 },
      data: {
        label: 'Social Media Prompt',
        text: 'You are a social media manager. Create a tweet-length marketing post based on the product image and video frame.',
      },
    },
    {
      id: 'llm-2',
      type: 'llmNode',
      position: { x: 1060, y: 460 },
      data: {
        label: 'Final Marketing LLM',
        model: 'openai:gpt-4o-mini',
      },
    },
  ];

  const edges = [
    // Branch A
    { id: 'e1', source: 'upload-image-1',    sourceHandle: 'output', target: 'crop-image-1',       targetHandle: 'image_url',    animated: true, style: { stroke: '#A855F7', strokeWidth: 2 } },
    { id: 'e2', source: 'crop-image-1',      sourceHandle: 'output', target: 'llm-1',              targetHandle: 'images',       animated: true, style: { stroke: '#A855F7', strokeWidth: 2 } },
    { id: 'e3', source: 'text-sys-prompt',   sourceHandle: 'output', target: 'llm-1',              targetHandle: 'system_prompt',animated: true, style: { stroke: '#A855F7', strokeWidth: 2 } },
    { id: 'e4', source: 'text-product-details', sourceHandle: 'output', target: 'llm-1',           targetHandle: 'user_message', animated: true, style: { stroke: '#A855F7', strokeWidth: 2 } },

    // Branch B
    { id: 'e5', source: 'upload-video-1',    sourceHandle: 'output', target: 'extract-frame-1',    targetHandle: 'video_url',    animated: true, style: { stroke: '#A855F7', strokeWidth: 2 } },

    // Convergence
    { id: 'e6', source: 'text-social-prompt', sourceHandle: 'output', target: 'llm-2',             targetHandle: 'system_prompt',animated: true, style: { stroke: '#A855F7', strokeWidth: 2 } },
    { id: 'e7', source: 'llm-1',             sourceHandle: 'output', target: 'llm-2',              targetHandle: 'user_message', animated: true, style: { stroke: '#A855F7', strokeWidth: 2 } },
    { id: 'e8', source: 'crop-image-1',      sourceHandle: 'output', target: 'llm-2',              targetHandle: 'images',       animated: true, style: { stroke: '#A855F7', strokeWidth: 2 } },
    { id: 'e9', source: 'extract-frame-1',   sourceHandle: 'output', target: 'llm-2',              targetHandle: 'images',       animated: true, style: { stroke: '#A855F7', strokeWidth: 2 } },
  ];

  // Create a dummy user-owned workflow (userId will need updating in prod)
  // This seed creates the workflow without a userId, to be claimed on first login
  const workflow = await prisma.workflow.upsert({
    where: { id: 'sample-product-marketing-kit' },
    update: { nodes, edges },
    create: {
      id: 'sample-product-marketing-kit',
      name: 'Product Marketing Kit Generator',
      userId: 'seed-placeholder',  // Replace with real userId after first sign-up
      nodes,
      edges,
      viewport: { x: 0, y: 0, zoom: 0.75 },
    },
  });

  console.log('✅ Seeded sample workflow:', workflow.id);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
