//
//  Item.swift
//  EGGcraft
//
//  Created by Gunes Gocmen on 23/04/2026.
//

import Foundation
import SwiftData

@Model
final class Item {
    var timestamp: Date
    
    init(timestamp: Date) {
        self.timestamp = timestamp
    }
}
