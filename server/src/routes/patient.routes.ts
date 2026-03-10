import { Router, Request, Response } from 'express';
import prisma from '../config/db';

const router = Router();

// GET /api/v1/patients
router.get('/', async (req: Request, res: Response) => {
  try {
    const { search, page = '1', limit = '20' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { clinicId: req.user?.clinicId };
    if (search) {
      where.name = { contains: String(search), mode: 'insensitive' };
    }

    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        skip,
        take: Number(limit),
        include: { noShowPattern: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.patient.count({ where }),
    ]);

    res.json({ data: patients, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/patients/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const patient = await prisma.patient.findFirst({
      where: { id: String(req.params.id), clinicId: req.user?.clinicId },
      include: {
        noShowPattern: true,
        documents: { orderBy: { createdAt: 'desc' } },
        appointments: { orderBy: { scheduledTime: 'desc' }, take: 20 },
      },
    });
    if (!patient) {
      res.status(404).json({ error: 'Patient not found or unauthorized' });
      return;
    }
    res.json(patient);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/patients
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, email, phone, preferredChannel, notificationPreferences, consentStatus } = req.body;
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    if (!req.user?.clinicId) {
      res.status(400).json({ error: 'User is not associated with a clinic' });
      return;
    }

    const patient = await prisma.patient.create({
      data: {
        name,
        email,
        phone,
        preferredChannel: preferredChannel || 'SMS',
        notificationPreferences: notificationPreferences || {},
        consentStatus: consentStatus !== undefined ? consentStatus : true,
        clinicId: req.user.clinicId,
      },
    });

    // Initialize no-show pattern record
    await prisma.noShowPattern.create({
      data: { patientId: patient.id },
    });

    res.status(201).json(patient);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// POST /api/v1/patients/bulk
router.post('/bulk', async (req: Request, res: Response) => {
  try {
    const { patients } = req.body;
    if (!Array.isArray(patients)) {
      res.status(400).json({ error: 'patients array is required' });
      return;
    }

    const clinicId = req.user?.clinicId;
    if (!clinicId) {
      res.status(400).json({ error: 'Clinic association required' });
      return;
    }

    const created = [];
    for (const p of patients) {
      const patient = await prisma.patient.create({
        data: {
          name: p.name,
          email: p.email,
          phone: p.phone,
          preferredChannel: p.preferredChannel || 'SMS',
          clinicId,
        }
      });
      await prisma.noShowPattern.create({ data: { patientId: patient.id } });
      created.push(patient);
    }

    res.status(201).json({ count: created.length, data: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/patients/:id/documents
router.post('/:id/documents', async (req: Request, res: Response) => {
  try {
    const { name, fileUrl, fileType, fileSize } = req.body;
    const patientId = req.params.id;

    const patient = await prisma.patient.findFirst({
      where: { id: patientId, clinicId: req.user?.clinicId }
    });

    if (!patient) {
      res.status(404).json({ error: 'Patient not found' });
      return;
    }

    const doc = await prisma.document.create({
      data: {
        patientId,
        name,
        fileUrl,
        fileType,
        fileSize
      }
    });

    res.status(201).json(doc);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/v1/patients/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    // First verify ownership
    const existing = await prisma.patient.findFirst({
      where: { id: String(req.params.id), clinicId: req.user?.clinicId }
    });
    if (!existing) {
      res.status(404).json({ error: 'Patient not found or unauthorized' });
      return;
    }

    const patient = await prisma.patient.update({
      where: { id: String(req.params.id) },
      data: req.body,
    });
    res.json(patient);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/v1/patients/:id (soft conceptual — keeps record but marks consent false)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.patient.findFirst({
      where: { id: String(req.params.id), clinicId: req.user?.clinicId }
    });
    if (!existing) {
      res.status(404).json({ error: 'Patient not found or unauthorized' });
      return;
    }

    await prisma.patient.update({
      where: { id: String(req.params.id) },
      data: { consentStatus: false },
    });
    res.json({ message: 'Patient consent withdrawn (soft delete)' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
