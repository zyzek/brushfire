// Add underbrush that burns faster, ignites at a lower temp but emits less heat when burned.
//
// Burn faster when the temperature is higher, when there's more oxygen.
//
// Higher heat = higher pressure (so affects flows)

var start_fuel = 1000;
var start_oxygen = 10000;

var ambient_temperature = 30.0;
var ambient_loss = 6.0;
var heat_transfer_rate = 1.0;

var fuel_potential_heat = 600000.0;
var fuel_ignition_temp = 500.0;
var fuel_burn_temp = 250.0;
var fuel_burn_rate = 1.0;
var fuel_mass = 100.0;
var fuel_heat_capacity = 1.0;

var oxygen_mass = 10.0;
var oxygen_heat_capacity = 0.4;
var oxygen_diffusion_rate = 10.0;

const inert_heat_capacity = 1.0;

const burn_oxygen_fuel_ratio = 20.0;

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


    calculate() {
        const pressure_delta = Math.abs(this.a.oxygen - this.b.oxygen);
        const pressure_dir = Math.sign(this.a.oxygen - this.b.oxygen);
        this.oxygen_flow = oxygen_diffusion_rate * pressure_dir * Math.sqrt(pressure_delta);
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
    constructor(temperature, fuel, oxygen, inert_mass) {
        this.fuel = fuel;
        this.oxygen = oxygen;
        this.inert_mass = inert_mass;
        this.heat = temperature * this.heat_capacity();

        this.burning = false;
        this.flows = [];
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
        const outflows = this.flows.filter(p => p.is_heat_source(this));
        const inflows = this.flows.filter(p => !p.is_heat_source(this));
        let out_total = outflows.map(p => Math.abs(p.heat_flow)).reduce((x, y) => x + y, 0)
        let in_total = inflows.map(p => Math.abs(p.heat_flow)).reduce((x, y) => x + y, 0)

        let env_loss = ambient_loss * heat_transfer_rate * (ambient_temperature - this.temperature());
        if (env_loss > 0) {
            in_total += env_loss;
        } else {
            out_total += env_loss;
        }

        if (this.heat + in_total < out_total) {
            const scale = (out_total - this.heat) / in_total;

            if (env_loss < 0) {
                env_loss *= scale;
            }

            for (const flow of outflows) {
                flow.heat_flow *= scale;
            }
        }

        this.heat += env_loss;
    }


    adjust_oxygen_flows() {
        const outflows = this.flows.filter(p => p.is_oxygen_source(this));
        const inflows = this.flows.filter(p => !p.is_oxygen_source(this));
        const out_total = outflows.map(p => Math.abs(p.oxygen_flow)).reduce((x, y) => x + y, 0)
        const in_total = inflows.map(p => Math.abs(p.oxygen_flow)).reduce((x, y) => x + y, 0)

        if (this.oxygen + in_total < out_total) {
            const scale = this.oxygen / out_total;
            if (in_total > 0) {
                const scale = (out_total - this.oxygen) / in_total;
            }
            for (const flow of outflows) {
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

}

class Grid {
    constructor(width, height, canvas, context) {
        this.width = width;
        this.height = height;
        this.canvas = canvas;
        this.context = context;

        this.mouseX = 0;
        this.mouseY = 0;

        this.tiles = new Array(height);
        this.flows = [];
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

                this.tiles[y][x] = new Tile(ambient_temperature, fuel, start_oxygen, 0);
            }
        }

        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width - 1; ++x) {
                let flow = new Flow(this.tiles[y][x], this.tiles[y][x+1]);
                this.tiles[y][x].flows.push(flow);
                this.tiles[y][x+1].flows.push(flow);
                this.flows.push(flow);
            }
        }

        for (let y = 0; y < height - 1; ++y) {
            for (let x = 0; x < width; ++x) {
                let flow = new Flow(this.tiles[y][x], this.tiles[y+1][x]);
                this.tiles[y][x].flows.push(flow);
                this.tiles[y+1][x].flows.push(flow);
                this.flows.push(flow);
            }
        }

        this.mouse_click_handler = this.mouse_click_handler.bind(this);
        canvas.addEventListener('click', this.mouse_click_handler);

        this.running = false;
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
    }
    
    screen_to_world(x, y) {
       return {x: parseInt(this.width * x / this.canvas.width) ,
               y: parseInt(this.height * y / this.canvas.height)};
    }

    mouse_click_handler(evnt) {
        this.mouseX = evnt.clientX;
        this.mouseY = evnt.clientY;
        
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


    draw() {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

        let square_size = parseInt(Math.min(this.canvas.height/this.height, this.canvas.width/this.width));
        
        for (let y = 0; y < this.height; ++y) {
            for (let x = 0; x < this.width; ++x) {
                let t = this.tiles[y][x];
                let red = parseInt(255 * t.temperature() / (fuel_ignition_temp * 4));
                let green = parseInt(100 * t.fuel / start_fuel);
                let blue = parseInt(100 * t.oxygen / start_oxygen);
                let color = "rgb(" + red + ", " + green + ", " + blue + ")";
                this.context.fillStyle = color;
                this.context.fillRect(x*square_size, y*square_size, square_size, square_size);
            }
        }

        this.draw_cursor();
    }

    main() {
        if (this.running) {
            this.update();
            this.draw();
            requestAnimationFrame(() => this.main());
        }
    }

    start() {
        this.running = true;
        requestAnimationFrame(() => this.main());
    }



}


var canvas = document.getElementById("canvas");
var context = canvas.getContext("2d");
var grid = new Grid(20, 20, canvas, context);

let o = 2;

for (let y = -o; y <= o; ++y) {
    for (let x = -o; x <= o; ++x) {
        grid.tiles[10 + y][10 + x].set_temperature(600);
    }
}

/*
for (let y = -o; y <= o; ++y) {
    for (let x = -o; x <= o; ++x) {
        grid.tiles[70 + y][30 + x].set_temperature(600);
    }
}*/

