import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/authMiddleware.js";
import {
  deleteInspectionsByTraceIds,
  getInspectionByComponentId,
  getInspectionByTraceId,
  getInspectionReportDataByComponentId,
  getInspectionReportDataByTraceId,
  listInspections,
  runInspection,
} from "../services/qualityOrchestrator.js";
import {
  buildNcrReportFilename,
  generateNcrReportPdf,
} from "../services/pdfReportService.js";

export const inspectionRouter = Router();

const inspectionSchema = z
  .object({
    component_id: z.string().min(1, "component_id is required"),
    image_url: z.string().optional().default(""),
    image_base64: z.string().optional().default(""),
    image_media_type: z.string().optional().default(""),
    image_file_name: z.string().optional().default(""),
    inspection_station: z.string().min(1, "inspection_station is required"),
    timestamp: z.string().optional(),
    line_id: z.string().min(1, "line_id is required"),
    metadata: z
      .object({
        material: z.string().optional(),
        supplier: z.string().optional(),
        batch_number: z.string().optional(),
        dimensions: z.string().optional(),
        tolerance_range: z.string().optional(),
        notes: z.string().optional(),
      })
      .default({}),
  })
  .refine((data) => data.image_url.trim() || data.image_base64.trim(), {
    message: "Either image_url or uploaded image is required",
    path: ["image_url"],
  })
  .refine((data) => !data.image_base64.trim() || data.image_media_type.startsWith("image/"), {
    message: "image_media_type must be an image MIME type when image_base64 is supplied",
    path: ["image_media_type"],
  });

const deleteInspectionsSchema = z.object({
  trace_ids: z.array(z.string().trim().min(1)).min(1, "Select at least one inspection"),
});

inspectionRouter.get("/", async (req, res, next) => {
  try {
    return res.json({ inspections: await listInspections(req.user) });
  } catch (error) {
    next(error);
  }
});

inspectionRouter.delete("/", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const parsed = deleteInspectionsSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid delete payload",
        details: parsed.error.flatten(),
      });
    }

    const uniqueTraceIds = Array.from(new Set(parsed.data.trace_ids));
    const result = await deleteInspectionsByTraceIds(uniqueTraceIds);

    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

inspectionRouter.get("/trace/:traceId/report.pdf", async (req, res, next) => {
  try {
    const reportData = await getInspectionReportDataByTraceId(req.params.traceId, req.user);

    if (!reportData) {
      return res.status(404).json({ message: "Inspection report data not found" });
    }

    const pdfBuffer = generateNcrReportPdf(reportData);
    const filename = buildNcrReportFilename(reportData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.send(pdfBuffer);
  } catch (error) {
    return next(error);
  }
});

inspectionRouter.get("/trace/:traceId", async (req, res, next) => {
  try {
    const inspection = await getInspectionByTraceId(req.params.traceId, req.user);

    if (!inspection) {
      return res.status(404).json({ message: "Inspection not found" });
    }

    return res.json(inspection);
  } catch (error) {
    return next(error);
  }
});

inspectionRouter.get("/:componentId/report.pdf", async (req, res, next) => {
  try {
    const reportData = await getInspectionReportDataByComponentId(req.params.componentId, req.user);

    if (!reportData) {
      return res.status(404).json({ message: "Inspection report data not found" });
    }

    const pdfBuffer = generateNcrReportPdf(reportData);
    const filename = buildNcrReportFilename(reportData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.send(pdfBuffer);
  } catch (error) {
    return next(error);
  }
});

inspectionRouter.get("/:componentId", async (req, res, next) => {
  try {
    const inspection = await getInspectionByComponentId(req.params.componentId, req.user);

    if (!inspection) {
      return res.status(404).json({ message: "Inspection not found" });
    }

    return res.json(inspection);
  } catch (error) {
    return next(error);
  }
});

inspectionRouter.post("/", async (req, res, next) => {
  try {
    const parsed = inspectionSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid inspection payload",
        details: parsed.error.flatten(),
      });
    }

    const result = await runInspection(
      {
        ...parsed.data,
        timestamp: parsed.data.timestamp || new Date().toISOString(),
      },
      req.user
    );

    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
});
