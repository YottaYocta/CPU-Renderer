import { Context } from "./context";
import { Vec3, Vec2, Ray, randInUnit } from "./utils";
import { Scene, Primitive, Sphere, IntersectionInfo } from "./renderable";

export class Camera {
  position: Vec3;
  focal: number;
  constructor(position = new Vec3(), focal = 1) {
    this.position = position;
    this.focal = focal;
  }
}

export class Renderer {
  #ctx: Context;
  #camera: Camera;

  #scene = new Scene();
  #light = new Vec3(4, 10, 0);
  #lightIntensity = 8;
  #lightRadius = 5;
  #worldColor = new Vec3();
  #maxBounces = 3;
  #samples = 10;
  #renderingProgress = 0;

  #aspect = 1;
  #vh = 2;
  #vw = 2;
  #horizontal = new Vec3();
  #vertical = new Vec3();
  #lowerCorner = new Vec3();

  constructor(ctx: Context, camera: Camera) {
    this.#ctx = ctx;
    this.#camera = camera;
  }

  set samples(samples: number) {
    this.#samples = samples;
  }

  set light(sphere: Sphere) {
    this.#light = sphere.origin;
    this.#lightRadius = sphere.radius;
  }

  set lightIntensity(lightIntensity: number) {
    this.#lightIntensity = lightIntensity;
  }

  configure() {
    this.#aspect = this.#ctx.width / this.#ctx.height;
    this.#vw = this.#vh * this.#aspect;
    this.#horizontal = new Vec3(this.#vw, 0, 0);
    this.#vertical = new Vec3(0, this.#vh, 0);
    this.#lowerCorner = this.#camera.position
      .sub(this.#horizontal.div(2))
      .sub(this.#vertical.div(2))
      .sub(new Vec3(0, 0, this.#camera.focal));
  }

  add(primitive: Primitive) {
    this.#scene.add(primitive);
  }

  render() {
    this.#renderingProgress = 0;
    let start = new Date();
    for (let i = 0; i < this.#samples; i++)
      this.castPixel(
        Math.floor(this.#ctx.width / 2),
        Math.floor(this.#ctx.height / 2)
      );
    let end = new Date();
    let maxPixelsPerframe = 34 / (start.getTime() - end.getTime());
    maxPixelsPerframe = Math.max(1, Math.floor(maxPixelsPerframe));

    this.batch(maxPixelsPerframe * 100);
  }

  batch(pixels: number) {
    let originalPixels = pixels;
    while (
      this.#renderingProgress <= this.#ctx.width * this.#ctx.height &&
      pixels >= 0
    ) {
      let y = Math.floor(this.#renderingProgress / this.#ctx.width);
      let x = this.#renderingProgress - y * this.#ctx.width;
      let total = new Vec3();
      for (let i = 0; i < this.#samples; i++) {
        total = total.add(this.castPixel(x, y).accumulator);
      }
      total = total.div(this.#samples);
      this.#ctx.setFlip(new Vec2(x, y), total);
      this.#renderingProgress++;
      pixels--;
    }

    if (this.#renderingProgress < this.#ctx.width * this.#ctx.height) {
      window.requestAnimationFrame(() => {
        this.batch(originalPixels);
      });
    }
  }

  castPixel(x: number, y: number) {
    let ray = new Ray(
      this.#camera.position.clone(),
      this.#lowerCorner
        .add(
          this.#horizontal.mul(
            (x + (Math.random() * 2 - 1) / 2) / this.#ctx.width
          )
        )
        .add(
          this.#vertical.mul(
            (y + (Math.random() * 2 - 1) / 2) / this.#ctx.height
          )
        )
        .norm()
    );
    let info = {
      ray: ray,
      normal: new Vec3(),
      hitTime: -1,
      mask: new Vec3(1, 1, 1),
      accumulator: new Vec3(),
    };
    this.scatter(info, this.#maxBounces);
    this.#ctx.setFlip(new Vec2(x, y), info.mask);
    return info;
  }

  scatter(info: IntersectionInfo, bounces: number) {
    if (bounces <= 0) {
      info.accumulator = info.accumulator.add(new Vec3());
      return;
    }
    this.#scene.intersect(info);
    this.intersectLight(info);
    if (info.hitTime < 0) {
      info.accumulator = info.accumulator.add(this.#worldColor);
      return;
    }
    info.accumulator = info.accumulator.add(info.mask);
    bounces--;
    this.scatter(info, bounces);
  }

  intersectLight(info: IntersectionInfo) {
    let ray = new Ray(
      info.ray.at(info.hitTime).add(info.normal.div(100)),
      this.#light
        .add(randInUnit().mul(this.#lightRadius))
        .sub(info.ray.at(info.hitTime))
        .norm()
    );
    let newInfo = {
      ray: ray,
      normal: ray.direction.clone(),
      hitTime: -1,
      mask: info.mask.clone(),
      accumulator: info.accumulator.clone(),
    };
    this.#scene.intersect(newInfo);
    if (newInfo.hitTime >= 0) {
      info.mask = new Vec3();
    } else {
      info.mask = info.mask.mul(
        this.#lightIntensity / this.#light.dist(ray.origin)
      );
    }
  }
}
