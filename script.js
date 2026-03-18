let tasks = JSON.parse(localStorage.getItem("tasks")) || []



function renderTasks() {

    let list = document.getElementById("taskList")
    list.innerHTML = ""

    tasks.forEach((task, index) => {

        let li = document.createElement("li")

        let checkbox = document.createElement("input")
        checkbox.type = "checkbox"
        checkbox.checked = task.completed

        checkbox.onchange = function(){
            tasks[index].completed = checkbox.checked
            saveTasks()
            renderTasks()
        }

        let span = document.createElement("span")
        span.textContent = task.text

        if(task.completed){
            span.classList.add("completed")
        }

        span.onclick = function(){
            tasks.splice(index,1)
            saveTasks()
            renderTasks()
        }

        li.appendChild(checkbox)
        li.appendChild(span)

        list.appendChild(li)

    })

    let remaining = tasks.filter(task => !task.completed).length

    document.getElementById("taskCount").textContent =
        remaining === 1 ? "1 task remaining" : remaining + " tasks remaining"
}




function addTask(){

    let input = document.getElementById("taskInput")

    if(input.value === "") return

    tasks.push({
        text: input.value,
        completed:false
    })

    saveTasks()
    renderTasks()

    input.value=""
}

// Add task when Enter key is pressed (fixed)
document.getElementById("taskInput").addEventListener("keydown", function(event){
    if(event.key === "Enter"){
        addTask();
    }
});


function saveTasks(){
    localStorage.setItem("tasks", JSON.stringify(tasks))
}

renderTasks()