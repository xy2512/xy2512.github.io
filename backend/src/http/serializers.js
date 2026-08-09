export function serializeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    account: row.account,
    displayName: row.display_name,
    city: row.city,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at
  };
}

export function serializeSkill(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    category: row.category,
    hourlyRate: Number(row.hourly_rate),
    teachingMode: row.teaching_mode,
    location: row.location,
    locationLatitude: row.location_latitude == null ? null : Number(row.location_latitude),
    locationLongitude: row.location_longitude == null ? null : Number(row.location_longitude),
    distanceKm: row.distance_km == null ? null : Math.round(Number(row.distance_km) * 10) / 10,
    tags: row.tags || [],
    description: row.description,
    availability: {
      days: row.availability_days || [],
      start: row.availability_start?.slice?.(0, 5) || row.availability_start || '',
      end: row.availability_end?.slice?.(0, 5) || row.availability_end || ''
    },
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    teacher: row.teacher_id ? {
      id: row.teacher_id,
      displayName: row.teacher_display_name,
      city: row.teacher_city,
      bio: row.teacher_bio,
      avatarUrl: row.teacher_avatar_url
    } : undefined
  };
}
