// Add underbrush that burns faster, ignites at a lower temp but emits less heat when burned.
//
// Burn faster when the temperature is higher, when there's more oxygen.
//
// Make flame colour reflect temperature.
// 
// Compression heating.
//
// Fix div by zero nukes.

var start_fuel = 1000;
var start_oxygen = 5000;

var ambient_temperature = 30.0;
var ambient_loss = 10.0;
var heat_transfer_rate = 1.0;

var fuel_potential_heat = 600000.0;
var fuel_ignition_temp = 500.0;
var fuel_burn_temp = 250.0;
var fuel_burn_rate = 1.0;
var fuel_mass = 100.0;
var fuel_heat_capacity = 1.0;

var oxygen_mass = 10.0;
var oxygen_heat_capacity = 0.4;
var oxygen_diffusion_rate = 5.0;

var pressure_coefficient = 0.05;
var wind_coefficient = 0.99;

var inert_heat_capacity = 1.0;

var burn_oxygen_fuel_ratio = 10.0;

const UP_IDX = 0;
const DOWN_IDX = 1;
const LEFT_IDX = 2;
const RIGHT_IDX = 3;

var wind_max_len = 20;


class Spark {
    constructor(tile) {
        this.tile = tile;
    }

    update() {
        if (this.tile.oxygen > 0) {
            const move_mass = this.tile.momentum_x + this.tile.momentum_y;
            const move_prob = move_mass / this.tile.oxygen;
            const rand = Math.random();
            //console.log(rand);
            //console.log(move_prob);
            if (rand < 0.025) {
                //this.tile = this.tile.flowdirs[RIGHT_IDX].get_other_tile(this.tile);
                if (rand < this.tile.momentum_x / move_mass) {
                    // Move in x direction
                    if (this.tile.momentum_x > 0) {
                        this.tile = this.tile.flowdirs[RIGHT_IDX].get_other_tile(this.tile);
                    }
                    else {
                        this.tile = this.tile.flowdirs[LEFT_IDX].get_other_tile(this.tile);
                    }
                }
                else {
                    // Move in y direction
                    if (this.tile.momentum_y > 0) {
                        this.tile = this.tile.flowdirs[DOWN_IDX].get_other_tile(this.tile);
                    }
                    else {
                        this.tile = this.tile.flowdirs[UP_IDX].get_other_tile(this.tile);
                    }
                }

            }
        }
    }
}



class Flow {
    constructor(a, b) {
        this.a = a;
        this.b = b;
        
        // Positive flow indicates a movement from a to b.
        this.oxygen_flow = 0;
        this.heat_flow = 0;
    }
    

    is_oxygen_source(t) {
        return (t === this.a && this.oxygen_flow > 0) || (t === this.b && this.oxygen_flow < 0);
    }


    is_heat_source(t) {
        return (t === this.a && this.heat_flow > 0) || (t === this.b && this.heat_flow < 0);
    }

    relative_oxygen_flow(t) {
            if (t == this.a) {
            return -this.oxygen_flow;
        }

        return this.oxygen_flow;
    }

    relative_heat_flow(t) {
        if (t == this.a) {
            return -this.heat_flow;
        }

        return this.heat_flow;
    }

    add_oxygen_flow_from(q, t) {
        if (t == this.a) {
            this.oxygen_flow += q;
        }
        else {
            this.oxygen_flow -= q;
        }
    }

    add_heat_flow_from(q, t) {
        if (t == this.a) {
            this.heat_flow += q;
        }
        else {
            this.heat_flow -= q;
        }
    }

    get_other_tile(t) {
        if (t == this.a) {
            return this.b;
        }
        return this.a;
    }


    calculate() {
        const avg_temp = (this.a.temperature() + this.b.temperature()) / 2;
        const pressure_delta = (this.a.pressure() - this.b.pressure())/avg_temp;
        this.oxygen_flow = oxygen_diffusion_rate * Math.sign(pressure_delta) * Math.sqrt(Math.abs(pressure_delta));
        this.heat_flow = heat_transfer_rate * (this.a.temperature() - this.b.temperature());
    }


    send() {
        // Don't send more than the source contains.
        if (this.oxygen_flow > this.a.oxygen) {
            this.oxygen_flow = this.a.oxygen;
        }
        else if (-this.oxygen_flow > this.b.oxygen) {
            this.oxygen_flow = -this.b.oxygen;
        }
        
        // Note that oxygen carries heat with it.
        let oxygen_heat_flow = this.oxygen_flow * oxygen_mass * oxygen_heat_capacity;
        if (this.oxygen_flow > 0) {
            oxygen_heat_flow *= this.a.temperature();
        } else {
            oxygen_heat_flow *= this.b.temperature();
        }
        this.heat_flow += oxygen_heat_flow;

        if (this.heat_flow > this.a.heat) {
            this.heat_flow = this.a.heat;
        }
        else if (-this.heat_flow > this.b.heat) {
            this.heat_flow = -this.b.heat;
        }

        // Send the stuff.
        this.a.oxygen -= this.oxygen_flow;
        this.b.oxygen += this.oxygen_flow;
        this.oxygen_flow = 0 ;

        this.a.heat -= this.heat_flow
        this.b.heat += this.heat_flow
        this.heat_flow = 0;
    }
}


class Tile {
    constructor(x, y, temperature, fuel, oxygen, inert_mass) {
        this.x = x;
        this.y = y;
        this.fuel = fuel;
        this.oxygen = oxygen;
        this.inert_mass = inert_mass;
        this.heat = temperature * this.heat_capacity();

        this.burning = false;
        this.flows = [];
        this.flowdirs = [undefined, undefined, undefined, undefined];
        this.momentum_x = 0;
        this.momentum_y = 0;
    }

    
    burn() {
        // Check if this tile should be burning or not.
        if (this.burning) {
            if (this.fuel <= 0 || this.oxygen <= 0) {
                this.burning = false;
            }
            
            if (this.temperature() < fuel_burn_temp) {
                this.burning = false;
            }
        }
        else if (this.temperature() >= fuel_ignition_temp && this.fuel > 0 && this.oxygen > 0) {
            this.burning = true;
        }

        // Actually burn some fuel.
        if (this.burning) {
            const fuel_quantity = Math.min(this.fuel, fuel_burn_rate);
            const oxygen_quantity = Math.min(this.oxygen, fuel_quantity*burn_oxygen_fuel_ratio);
            const burned_fuel = Math.min(fuel_quantity, oxygen_quantity/burn_oxygen_fuel_ratio);
            
            this.oxygen -= burned_fuel * burn_oxygen_fuel_ratio;
            this.fuel -= burned_fuel;
            this.inert_mass += burned_fuel * (burn_oxygen_fuel_ratio*oxygen_mass + fuel_mass);
            this.heat += burned_fuel * fuel_potential_heat;
        }
    }
    
 
    adjust_heat_flows() {
        const rel_flows = this.flows.map(f => f.relative_heat_flow(this));
        let out_total = -rel_flows.filter(f => f < 0).reduce((x, y) => x + y, 0);
        let in_total = rel_flows.filter(f => f > 0).reduce((x, y) => x + y, 0);

        let env_loss = ambient_loss * heat_transfer_rate * (ambient_temperature - this.temperature());
        if (env_loss > 0) {
            in_total += env_loss;
        } else {
            out_total += env_loss;
        }

        if (this.heat + in_total < out_total) {
            const scale = (in_total + this.heat) / out_total;

            if (env_loss < 0) {
                env_loss *= scale;
            }

            for (let flow of this.flows.filter(p => p.is_heat_source(this))) {
                flow.heat_flow *= scale;
            }
        }

        this.heat += env_loss;
    }


    adjust_oxygen_flows() {
        // Handle momentum; positive numbers mean left to right, up to down.
        let x_momentum = 0;
        if (this.flowdirs[LEFT_IDX]) {
            x_momentum += this.flowdirs[LEFT_IDX].relative_oxygen_flow(this);
        }
        if (this.flowdirs[RIGHT_IDX]) {
            x_momentum -= this.flowdirs[RIGHT_IDX].relative_oxygen_flow(this);
        }

        let y_momentum = 0;
        if (this.flowdirs[UP_IDX]) {
            y_momentum += this.flowdirs[UP_IDX].relative_oxygen_flow(this);
        }
        if (this.flowdirs[DOWN_IDX]) {
            y_momentum -= this.flowdirs[DOWN_IDX].relative_oxygen_flow(this);
        }
        
        if (x_momentum > 0) {
            if (this.flowdirs[RIGHT_IDX]) {
                x_momentum *= x_momentum * wind_coefficient / (x_momentum + this.oxygen);
                this.flowdirs[RIGHT_IDX].add_oxygen_flow_from(x_momentum, this);
            }
            else {
                x_momentum = 0;
            }
        }
        else {
            if (this.flowdirs[LEFT_IDX] && (x_momentum - this.oxygen != 0)) {
                x_momentum *= x_momentum * wind_coefficient / (this.oxygen - x_momentum);
                this.flowdirs[LEFT_IDX].add_oxygen_flow_from(x_momentum, this);
            }
            else {
                x_momentum = 0;
            }
        }

        if (y_momentum > 0) {
            if (this.flowdirs[DOWN_IDX]) {
                y_momentum *= y_momentum * wind_coefficient / (y_momentum + this.oxygen);
                this.flowdirs[DOWN_IDX].add_oxygen_flow_from(y_momentum, this);
            }
            else {
                y_momentum = 0;
            }
        }
        else {
            if (this.flowdirs[UP_IDX] && (y_momentum - this.oxygen != 0)) {
                y_momentum *= y_momentum * wind_coefficient / (this.oxygen - y_momentum);
                this.flowdirs[UP_IDX].add_oxygen_flow_from(y_momentum, this);
            }
            else {
                y_momentum = 0;
            }
        }

        this.momentum_x = x_momentum;
        this.momentum_y = y_momentum;


        const rel_flows = this.flows.map(f => f.relative_oxygen_flow(this));
        const out_total = -rel_flows.filter(f => f < 0).reduce((x, y) => x + y, 0);
        const in_total = rel_flows.filter(f => f > 0).reduce((x, y) => x + y, 0);

        if (this.oxygen + in_total < out_total) {
            const scale = (in_total + this.oxygen) / out_total;
            for (let flow of this.flows.filter(p => p.is_oxygen_source(this))) {
                flow.heat_flow *= scale;
            }
        }

    }

    adjust_flows() {
        this.adjust_heat_flows();
        this.adjust_oxygen_flows();
    }

    
    fuel_mass() {
        return this.fuel * fuel_mass;
    }

    oxygen_mass() {
        return this.oxygen * oxygen_mass;
    }


    mass() {
        return this.fuel_mass() + this.oxygen_mass() + this.inert_mass;
    }

    
    heat_capacity() {
        return this.fuel_mass() * fuel_heat_capacity + this.oxygen_mass() * oxygen_heat_capacity + this.inert_mass * inert_heat_capacity;
    }

    
    temperature() {
        return this.heat / this.heat_capacity();
    }

    set_temperature(t) {
        this.heat = t * this.heat_capacity();
    }

    pressure() {
        return (pressure_coefficient * (this.temperature() - 1) + 1) * this.oxygen_mass();
    }

}

class Grid {
    constructor(width, height, canvas, context) {
        this.width = width;
        this.height = height;
        this.canvas = canvas;
        this.context = context;
        this.tile_size = parseInt(Math.min(this.canvas.height/this.height, this.canvas.width/this.width));

        this.rect = this.canvas.getBoundingClientRect();
        
        this.running = false;
        this.drawing = true;
        this.windicators = true;

        this.mouseX = 0;
        this.mouseY = 0;

        this.tiles = new Array(height);
        this.flows = [];
        this.sparks = [];

        for (let y = 0; y < height; ++y) {
            this.tiles[y] = new Array(width);
            for (let x = 0; x < width; x++) {
                let mapper = (x) => {
                    if (x < 0.5) {
                        return 2*x;
                    }
                    return (1.75 - x)%1;
                }

                let fuel = start_fuel * mapper(Math.random());

                if (y % 2 === 1) {
                    fuel = this.tiles[y-1][x].fuel;
                }
                else if (x % 2 === 1) {
                    fuel = this.tiles[y][x-1].fuel;
                }

                this.tiles[y][x] = new Tile(x, y, ambient_temperature, fuel, start_oxygen, 0);
            }
        }

        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width - 1; ++x) {
                let flow = new Flow(this.tiles[y][x], this.tiles[y][x+1]);
                this.tiles[y][x].flows.push(flow);
                this.tiles[y][x].flowdirs[RIGHT_IDX] = flow;
                this.tiles[y][x+1].flows.push(flow);
                this.tiles[y][x+1].flowdirs[LEFT_IDX] = flow;
                this.flows.push(flow);
            }
        }

        for (let y = 0; y < height - 1; ++y) {
            for (let x = 0; x < width; ++x) {
                let flow = new Flow(this.tiles[y][x], this.tiles[y+1][x]);
                this.tiles[y][x].flows.push(flow);
                this.tiles[y][x].flowdirs[DOWN_IDX] = flow;
                this.tiles[y+1][x].flows.push(flow);
                this.tiles[y+1][x].flowdirs[UP_IDX] = flow;
                this.flows.push(flow);
            }
        }

        this.mouse_click_handler = this.mouse_click_handler.bind(this);
        canvas.addEventListener('click', this.mouse_click_handler);

    }
   

    update() {
        // Burn on every square.
        for (let row of this.tiles) {
            for (let tile of row) {
                tile.burn()
            }
        }
        
        // Calculate the required flows between cells.
        for (let flow of this.flows) {
            flow.calculate();
        }
        
        // Adjust stuff if flows are too large.
        for (let row of this.tiles) {
            for (let tile of row) {
                tile.adjust_flows()
            }
        }
        
        // Send the flows themselves.
        for (let flow of this.flows) {
            flow.send();
        }
        
        // Waft sparks around.
        for (let spark of this.sparks) {
            spark.update();
        }
    }
    
    screen_to_world(x, y) {
       return {x: parseInt(this.width * (x + this.rect.left) / this.canvas.width) ,
               y: parseInt(this.height * (y + this.rect.top) / this.canvas.height)};
    }

    mouse_click_handler(evnt) {
        this.mouseX = evnt.clientX - this.rect.left;
        this.mouseY = evnt.clientY - this.rect.top;

        console.log(this.mouseX);
        console.log(this.mouseY);
        
        let p = this.screen_to_world(this.mouseX, this.mouseY);
        let t = this.tiles[p.y][p.x];
        console.log(p);
        console.log(t);
    }

    draw_cursor() {
        let p = this.screen_to_world(this.mouseX, this.mouseY);
        let t = this.tiles[p.y][p.x];

        let text = "Temp: " + Math.floor(t.temperature()) + "  Oxy: " + Math.floor(t.oxygen) + "  Fuel: " + Math.floor(t.fuel) + "  Burn: " + t.burning;
        
        this.context.save();
        this.context.strokeStyle = "white";
        this.context.beginPath();
        this.context.moveTo(this.mouseX, 0);
        this.context.lineTo(this.mouseX, this.canvas.height);
        this.context.moveTo(0, this.mouseY);
        this.context.lineTo(this.canvas.width, this.mouseY);
        this.context.closePath()
        this.context.stroke();
        this.context.fillStyle = "rgb(200, 200, 200)";
        this.context.fillText(text, this.mouseX + 3, this.mouseY - 3);
        this.context.restore();
    }

    draw_tiles() {
        for (let y = 0; y < this.height; ++y) {
            for (let x = 0; x < this.width; ++x) {
                let t = this.tiles[y][x];
                let red = parseInt(255 * t.temperature() / (fuel_ignition_temp * 4));
                let green = parseInt(100 * t.fuel / start_fuel);
                let blue = parseInt(100 * t.oxygen / start_oxygen);
                let color = "rgb(" + red + ", " + green + ", " + blue + ")";
                this.context.fillStyle = color;
                this.context.fillRect(x*this.tile_size, y*this.tile_size, this.tile_size, this.tile_size);
                let alpha = t.burning ? (1 + Math.cos(t.temperature()))/3 : 0.0;
                color = "rgba(255, 150, 0, " + alpha + ")";
                this.context.fillStyle = color;
                this.context.fillRect(x*this.tile_size, y*this.tile_size, this.tile_size, this.tile_size);
            }
        }
    }

    draw_windicators() {
        for (let y = 0; y < this.height; ++y) {
            for (let x = 0; x < this.width; ++x) {
                let t = this.tiles[y][x];
                let x_pos = x*this.tile_size + this.tile_size / 2;
                let y_pos = y*this.tile_size + this.tile_size / 2;
                let x_len = 2*t.momentum_x;
                let y_len = 2*t.momentum_y;

                let magnitude = Math.sqrt(x_len*x_len + y_len*y_len);

                if (magnitude > wind_max_len) {
                    let scale = wind_max_len / magnitude;
                    x_len *= scale;
                    y_len *= scale;
                }
                
                this.context.save();
                this.context.strokeStyle = "white";
                this.context.lineWidth = 0.5;
                this.context.beginPath();
                this.context.moveTo(x_pos, y_pos);
                this.context.lineTo(x_pos + x_len, y_pos + y_len);
                this.context.closePath()
                this.context.stroke();
                this.context.restore();
            }
        }
    }

    draw_sparks() {
        this.context.save();
        this.context.strokeStyle = "black";
        this.context.fillStyle = "orange";

        for (let spark of this.sparks) {
            let x = spark.tile.x * this.tile_size + this.tile_size / 2;
            let y = spark.tile.y * this.tile_size + this.tile_size / 2;

            this.context.beginPath();
            this.context.arc(x, y, 2, 0, 2*Math.PI, true);
            this.context.fill();
            this.context.stroke();
            this.context.closePath();
        }
        this.context.restore();
    }

    draw() {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.draw_tiles();

        this.draw_sparks();

        if (this.windicators) {
            this.draw_windicators();
        }

        this.draw_cursor();
    }

    main() {
        if (this.running) {
            this.update();
        }
        if (this.drawing) {
            this.draw();
        }
        requestAnimationFrame(() => this.main());
    }

    start() {
        this.running = true;
        requestAnimationFrame(() => this.main());
    }

    stop() {
        this.running = false;
    }
}


var canvas = document.getElementById("canvas");
var context = canvas.getContext("2d");

var grid_x = 40;
var grid_y = 40;

var grid = new Grid(grid_x, grid_y, canvas, context);

let px = 10;
let py = 10;
let o = 1;

for (let y = -o; y <= o; ++y) {
    for (let x = -o; x <= o; ++x) {
        grid.tiles[py + y][px + x].set_temperature(600);
    }
}

/*
grid.sparks.push(new Spark(grid.tiles[10][5]));
grid.sparks.push(new Spark(grid.tiles[5][10]));
grid.sparks.push(new Spark(grid.tiles[10][15]));
grid.sparks.push(new Spark(grid.tiles[5][5]));
grid.sparks.push(new Spark(grid.tiles[20][5]));
*/

grid.main();
