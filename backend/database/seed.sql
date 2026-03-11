-- ============================================
-- La Maison du Regard — Seed Data
-- ============================================

-- Practitioner: Célia (password: admin123)
INSERT INTO practitioner (id, first_name, last_name, email, password_hash, phone)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Célia',
  'Practicienne',
  'celia@lamaisonduregard.fr',
  '$2b$12$LJ3m4ys3Lg4F2f0MFxrn2O7UQOdHrT9yvDTnPBCXE/EHdRcL2GxPu',
  ''
);

-- ============================================
-- Services — 22 prestations
-- ============================================

-- SOURCILS (category: sourcils)
INSERT INTO services (name, category, description, duration, price, color, is_active, is_popular, sort_order) VALUES
  ('Restructuration sourcils', 'sourcils', 'Épilation et mise en forme des sourcils', 30, 2000, '#C9A96E', true, true, 1),
  ('Teinture sourcils', 'sourcils', 'Coloration semi-permanente des sourcils', 20, 1500, '#C9A96E', true, false, 2),
  ('Rehaussement de sourcils', 'sourcils', 'Lissage et fixation des poils de sourcils', 45, 4000, '#C9A96E', true, false, 3),
  ('Restructuration + Teinture', 'sourcils', 'Épilation + coloration sourcils', 45, 3000, '#C9A96E', true, true, 4),
  ('Brow Lift + Teinture', 'sourcils', 'Rehaussement + coloration sourcils', 60, 5000, '#C9A96E', true, false, 5),
  ('Brow Lift + Restructuration + Teinture', 'sourcils', 'Soin complet sourcils', 75, 5500, '#C9A96E', true, false, 6);

-- MAQUILLAGE PERMANENT (category: maquillage_permanent)
INSERT INTO services (name, category, description, duration, price, color, is_active, is_popular, sort_order) VALUES
  ('Microblading sourcils', 'maquillage_permanent', 'Technique poil à poil pour un effet naturel', 120, 25000, '#D4A574', true, true, 7),
  ('Microshading sourcils', 'maquillage_permanent', 'Technique ombrée pour un effet poudré', 120, 25000, '#D4A574', true, false, 8),
  ('Combo Microblading + Microshading', 'maquillage_permanent', 'Technique mixte poil à poil et ombré', 150, 30000, '#D4A574', true, true, 9),
  ('Retouche microblading (< 2 mois)', 'maquillage_permanent', 'Retouche incluse dans les 2 mois', 90, 0, '#D4A574', true, false, 10),
  ('Retouche microblading (2-12 mois)', 'maquillage_permanent', 'Retouche entre 2 et 12 mois', 90, 10000, '#D4A574', true, false, 11),
  ('Retouche microblading (> 12 mois)', 'maquillage_permanent', 'Retouche après 12 mois', 120, 15000, '#D4A574', true, false, 12),
  ('Candy Lips', 'maquillage_permanent', 'Maquillage permanent des lèvres effet glossy', 150, 30000, '#D4A574', true, true, 13),
  ('Retouche Candy Lips (< 2 mois)', 'maquillage_permanent', 'Retouche lèvres dans les 2 mois', 90, 0, '#D4A574', true, false, 14),
  ('Retouche Candy Lips (2-12 mois)', 'maquillage_permanent', 'Retouche lèvres entre 2 et 12 mois', 90, 10000, '#D4A574', true, false, 15),
  ('Retouche Candy Lips (> 12 mois)', 'maquillage_permanent', 'Retouche lèvres après 12 mois', 120, 15000, '#D4A574', true, false, 16),
  ('Eye-liner maquillage permanent', 'maquillage_permanent', 'Trait d''eye-liner permanent', 120, 20000, '#D4A574', true, false, 17);

-- CILS (category: cils)
INSERT INTO services (name, category, description, duration, price, color, is_active, is_popular, sort_order) VALUES
  ('Rehaussement de cils', 'cils', 'Lissage permanent des cils', 60, 5000, '#B5838D', true, true, 18),
  ('Rehaussement + Teinture cils', 'cils', 'Rehaussement avec coloration', 75, 5500, '#B5838D', true, true, 19),
  ('Teinture cils', 'cils', 'Coloration des cils', 20, 1500, '#B5838D', true, false, 20),
  ('Extension cils classique', 'cils', 'Pose complète extensions cil à cil', 120, 8000, '#B5838D', true, false, 21),
  ('Remplissage extensions (< 3 sem.)', 'cils', 'Remplissage extensions de cils', 60, 4500, '#B5838D', true, false, 22);

-- ============================================
-- Schedules (0=Monday ... 6=Sunday)
-- ============================================
INSERT INTO schedules (day_of_week, start_time, end_time, is_working) VALUES
  (0, '09:00', '19:00', true),   -- Monday
  (1, '09:00', '19:00', true),   -- Tuesday
  (2, '09:00', '19:00', true),   -- Wednesday
  (3, '09:00', '19:00', true),   -- Thursday
  (4, '09:00', '19:00', true),   -- Friday
  (5, '09:00', '17:00', true),   -- Saturday
  (6, '09:00', '19:00', false);  -- Sunday (OFF)

-- ============================================
-- Automation triggers
-- ============================================
INSERT INTO automation_triggers (type, is_active, config) VALUES
  ('review_sms', true, '{"delay_minutes": 60, "message": "Merci pour votre visite a La Maison du Regard ! Votre avis compte beaucoup pour nous : {lien_avis}"}');
