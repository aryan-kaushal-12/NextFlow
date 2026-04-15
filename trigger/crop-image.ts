import { task, logger } from '@trigger.dev/sdk/v3';
import { cropImageViaTransloadit } from '@/lib/transloadit';
import prisma from '@/lib/prisma';

interface CropImagePayload {
  executionId: string;
  imageUrl: string;
  x_percent: number;
  y_percent: number;
  width_percent: number;
  height_percent: number;
}

export const cropImageTask = task({
  id: 'crop-image',
  maxDuration: 120,
  run: async (payload: CropImagePayload) => {
    const { executionId, imageUrl, x_percent, y_percent, width_percent, height_percent } = payload;
    const startTime = Date.now();

    logger.info('Crop image task executing', { imageUrl, x_percent, y_percent, width_percent, height_percent });

    try {
      await prisma.nodeExecution.update({
        where: { id: executionId },
        data: { status: 'RUNNING', inputs: JSON.parse(JSON.stringify(payload)) },
      });

      const outputUrl = await cropImageViaTransloadit(
        imageUrl,
        x_percent,
        y_percent,
        width_percent,
        height_percent
      );

      const duration = Date.now() - startTime;
      await prisma.nodeExecution.update({
        where: { id: executionId },
        data: { status: 'SUCCESS', outputs: { output: outputUrl }, duration },
      });

      logger.info('Crop image completed', { outputUrl, duration });
      return { output: outputUrl };
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';
      await prisma.nodeExecution.update({
        where: { id: executionId },
        data: { status: 'FAILED', error: message, duration },
      });
      throw error;
    }
  },
});
