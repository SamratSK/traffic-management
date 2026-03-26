#[no_mangle]
pub extern "C" fn alloc_f32(len: usize) -> *mut f32 {
    let mut data = Vec::<f32>::with_capacity(len);
    let ptr = data.as_mut_ptr();
    std::mem::forget(data);
    ptr
}

#[no_mangle]
pub extern "C" fn alloc_u8(len: usize) -> *mut u8 {
    let mut data = Vec::<u8>::with_capacity(len);
    let ptr = data.as_mut_ptr();
    std::mem::forget(data);
    ptr
}

#[no_mangle]
pub extern "C" fn free_f32(ptr: *mut f32, len: usize) {
    unsafe {
        drop(Vec::from_raw_parts(ptr, len, len));
    }
}

#[no_mangle]
pub extern "C" fn free_u8(ptr: *mut u8, len: usize) {
    unsafe {
        drop(Vec::from_raw_parts(ptr, len, len));
    }
}

fn clamp(value: f32, min: f32, max: f32) -> f32 {
    if value < min {
        min
    } else if value > max {
        max
    } else {
        value
    }
}

fn lerp(start: f32, end: f32, factor: f32) -> f32 {
    start + (end - start) * factor
}

fn sample_gradient(intensity: f32) -> [u8; 4] {
    const STOPS: [(f32, [u8; 4]); 8] = [
        (0.0, [48, 108, 219, 88]),
        (0.14, [76, 140, 255, 112]),
        (0.28, [103, 216, 255, 128]),
        (0.44, [162, 247, 182, 140]),
        (0.6, [241, 241, 112, 156]),
        (0.76, [255, 180, 92, 178]),
        (0.9, [250, 116, 104, 206]),
        (1.0, [204, 58, 86, 232]),
    ];

    let clamped = clamp(intensity, 0.0, 1.0);
    for index in 0..(STOPS.len() - 1) {
        let current = STOPS[index];
        let next = STOPS[index + 1];
        if clamped <= next.0 {
            let factor = (clamped - current.0) / (next.0 - current.0).max(0.0001);
            return [
                lerp(current.1[0] as f32, next.1[0] as f32, factor).round() as u8,
                lerp(current.1[1] as f32, next.1[1] as f32, factor).round() as u8,
                lerp(current.1[2] as f32, next.1[2] as f32, factor).round() as u8,
                lerp(current.1[3] as f32, next.1[3] as f32, factor).round() as u8,
            ];
        }
    }

    STOPS[STOPS.len() - 1].1
}

#[no_mangle]
pub extern "C" fn generate_heatmap_rgba(
    points_ptr: *const f32,
    point_count: usize,
    width: usize,
    height: usize,
    min_lng: f32,
    min_lat: f32,
    max_lng: f32,
    max_lat: f32,
    baseline: f32,
    output_ptr: *mut u8,
) {
    let points = unsafe { std::slice::from_raw_parts(points_ptr, point_count * 7) };
    let output = unsafe { std::slice::from_raw_parts_mut(output_ptr, width * height * 4) };

    let lng_span = max_lng - min_lng;
    let lat_span = max_lat - min_lat;

    for y in 0..height {
        let lat = max_lat - (((y as f32) + 0.5) / (height as f32)) * lat_span;

        for x in 0..width {
            let lng = min_lng + (((x as f32) + 0.5) / (width as f32)) * lng_span;
            let mut intensity = baseline;

            for point_index in 0..point_count {
                let offset = point_index * 7;
                let point_lng = points[offset];
                let point_lat = points[offset + 1];
                let spread_km = points[offset + 2];
                let core_amplitude = points[offset + 3];
                let ring_radius_km = points[offset + 4];
                let ring_width_km = points[offset + 5];
                let ring_amplitude = points[offset + 6];

                let cos_lat = (((lat + point_lat) * 0.5) * std::f32::consts::PI / 180.0).cos().abs().max(0.0001);
                let lng_km = (lng - point_lng) * 111.32 * cos_lat;
                let lat_km = (lat - point_lat) * 111.32;
                let distance_km = (lng_km * lng_km + lat_km * lat_km).sqrt();

                let spread = spread_km.max(0.0001);
                intensity += core_amplitude * (-(distance_km * distance_km) / (2.0 * spread * spread)).exp();

                let ring_width = ring_width_km.max(0.0001);
                let ring_delta = distance_km - ring_radius_km;
                intensity += ring_amplitude * (-(ring_delta * ring_delta) / (2.0 * ring_width * ring_width)).exp();
            }

            let pixel = sample_gradient(intensity);
            let out_offset = (y * width + x) * 4;
            output[out_offset] = pixel[0];
            output[out_offset + 1] = pixel[1];
            output[out_offset + 2] = pixel[2];
            output[out_offset + 3] = pixel[3];
        }
    }
}
